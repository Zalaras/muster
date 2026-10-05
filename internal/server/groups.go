package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/session"
)

// groupWire is the Group object (kb:anchor/ws.groups): a rail section the developer made.
// Membership never travels here — a session's groupId rides its own sessionUpsert.
type groupWire struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Pos       int64  `json:"pos"`
	Collapsed bool   `json:"collapsed"`
}

// ungroupedWire is the Ungrouped section's place and collapsed flag; always present on the
// `groups` message and the snapshot.
type ungroupedWire struct {
	Pos       int64 `json:"pos"`
	Collapsed bool  `json:"collapsed"`
}

// groupsMessage is the WS `groups` envelope (kb:anchor/ws.groups): the whole group list plus
// the Ungrouped layout on every change, loss-tolerant by construction like `prefs`.
type groupsMessage struct {
	Type      string        `json:"type"`
	Groups    []groupWire   `json:"groups"`
	Ungrouped ungroupedWire `json:"ungrouped"`
}

func toWireGroups(groups []session.Group, ungrouped session.UngroupedLayout) ([]groupWire, ungroupedWire) {
	out := make([]groupWire, len(groups))
	for i, g := range groups {
		out[i] = groupWire{ID: g.ID, Name: g.Name, Pos: g.Pos, Collapsed: g.Collapsed}
	}
	return out, ungroupedWire{Pos: ungrouped.Pos, Collapsed: ungrouped.Collapsed}
}

// groupsWire builds the envelope session.Manager's OnGroups callback broadcasts (New wires
// it, server.go), beside sessionUpsertWire and sessionRemovedWire.
func groupsWire(groups []session.Group, ungrouped session.UngroupedLayout) groupsMessage {
	wire, ungroupedOut := toWireGroups(groups, ungrouped)
	return groupsMessage{Type: "groups", Groups: wire, Ungrouped: ungroupedOut}
}

// codeUnknownGroup and the messages below are the group endpoints' fixed error texts
// (kb:anchor/transport), each spelled once because more than one handler (or launcher.go)
// answers with it.
const (
	codeUnknownGroup     = "unknown_group"
	msgUnknownGroup      = "unknown group"
	msgGroupNameBounds   = "name must be 1-40 characters after trimming"
	msgGroupOrder        = "order must list every group id and 0 exactly once"
	msgCollapsedRequired = "collapsed is required and must be a boolean"
	msgGroupSessionIDs   = "sessionIds must be session ids without duplicates"
	msgGroupDisposition  = "sessions must be ungroup, move or remove"
	msgGroupIDField      = "groupId must be an integer or null"
)

func writeUnknownGroup(w http.ResponseWriter, message string) {
	writeJSONError(w, http.StatusNotFound, codeUnknownGroup, message)
}

// writeBodyError answers a request body that did not decode. A field whose value had the
// wrong JSON type is named by its own message in fieldMessages (an array element's error
// names the array's field); any other failure is a body that is not JSON.
func writeBodyError(w http.ResponseWriter, err error, fieldMessages map[string]string) {
	var typeErr *json.UnmarshalTypeError
	if errors.As(err, &typeErr) {
		field, _, _ := strings.Cut(typeErr.Field, ".")
		if message, ok := fieldMessages[field]; ok {
			writeInvalidRequest(w, message)
			return
		}
	}
	writeInvalidRequest(w, "invalid JSON body")
}

// decodeGroupID reads a request's groupId, which may be an integer or null. ok is false for
// any other JSON type and for an empty raw, which is a key the body did not carry; a caller
// that treats an absent key differently checks len(raw) first.
func decodeGroupID(raw json.RawMessage) (id *int64, ok bool) {
	if string(raw) == "null" {
		return nil, true
	}
	var v int64
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, false
	}
	return &v, true
}

// groupsFeature owns the rail-group endpoints and the snapshot's groups and ungrouped.
// teardown is sessionsFeature.teardownRemoved: delete-group's remove disposition tears down
// each removed session's terminal, shell and write log exactly as DELETE /api/sessions/{id}
// does.
type groupsFeature struct {
	manager  *session.Manager
	teardown func(ctx context.Context, id int64)
	log      zerolog.Logger
}

func newGroupsFeature(manager *session.Manager, teardown func(ctx context.Context, id int64), log zerolog.Logger) *groupsFeature {
	return &groupsFeature{manager: manager, teardown: teardown, log: log}
}

func (f *groupsFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/groups", guard(http.HandlerFunc(f.handleCreateGroup)))
	// The literal order and collapsed segments win over {id}, as sessions/order does.
	mux.Handle("PUT /api/groups/order", guard(http.HandlerFunc(f.handleSetOrder)))
	mux.Handle("PUT /api/groups/collapsed", guard(http.HandlerFunc(f.handleSetAllCollapsed)))
	mux.Handle("PUT /api/groups/{id}", guard(http.HandlerFunc(f.handleUpdateGroup)))
	mux.Handle("DELETE /api/groups/{id}", guard(http.HandlerFunc(f.handleDeleteGroup)))
}

func (f *groupsFeature) contribute(_ context.Context, snap *Snapshot) {
	snap.Groups, snap.Ungrouped = toWireGroups(f.manager.Groups())
}

// parseGroupID reads the {id} path value, writing 404 unknown_group itself on a malformed
// one — an unparseable id is indistinguishable from an unknown one. 0 is the Ungrouped section.
func parseGroupID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id < 0 {
		writeUnknownGroup(w, msgUnknownGroup)
		return 0, false
	}
	return id, true
}

// createGroupRequest is POST /api/groups' request body (kb:anchor/groups.create).
type createGroupRequest struct {
	Name       string  `json:"name"`
	SessionIDs []int64 `json:"sessionIds"`
}

// handleCreateGroup is POST /api/groups (kb:anchor/groups.create).
func (f *groupsFeature) handleCreateGroup(w http.ResponseWriter, r *http.Request) {
	var req createGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeBodyError(w, err, map[string]string{"name": msgGroupNameBounds, "sessionIds": msgGroupSessionIDs})
		return
	}

	g, err := f.manager.CreateGroup(context.WithoutCancel(r.Context()), req.Name, req.SessionIDs)
	switch {
	case err == nil:
		writeJSON(w, http.StatusCreated, groupWire{ID: g.ID, Name: g.Name, Pos: g.Pos, Collapsed: g.Collapsed})
	case errors.Is(err, session.ErrInvalidGroupName):
		writeInvalidRequest(w, msgGroupNameBounds)
	case errors.Is(err, session.ErrInvalidOrder):
		writeInvalidRequest(w, msgGroupSessionIDs)
	case errors.Is(err, session.ErrUnknownSession):
		writeJSONError(w, http.StatusNotFound, codeUnknownSession, "unknown session")
	default:
		f.log.Error().Err(err).Msg("creating group failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
	}
}

// updateGroupRequest is PUT /api/groups/{id}'s request body (kb:anchor/groups.update).
// Pointers distinguish an absent field from a present one.
type updateGroupRequest struct {
	Name      *string `json:"name"`
	Collapsed *bool   `json:"collapsed"`
}

// handleUpdateGroup is PUT /api/groups/{id} (kb:anchor/groups.update); {id} 0 is Ungrouped.
func (f *groupsFeature) handleUpdateGroup(w http.ResponseWriter, r *http.Request) {
	id, ok := parseGroupID(w, r)
	if !ok {
		return
	}

	var req updateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeBodyError(w, err, map[string]string{"name": msgGroupNameBounds, "collapsed": msgCollapsedRequired})
		return
	}
	if req.Name == nil && req.Collapsed == nil {
		writeInvalidRequest(w, "name or collapsed is required")
		return
	}
	if id == 0 && req.Name != nil {
		writeInvalidRequest(w, "the Ungrouped section cannot be renamed")
		return
	}

	switch err := f.manager.UpdateGroup(context.WithoutCancel(r.Context()), id, req.Name, req.Collapsed); {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, session.ErrInvalidGroupName):
		writeInvalidRequest(w, msgGroupNameBounds)
	case errors.Is(err, session.ErrUnknownGroup):
		writeUnknownGroup(w, msgUnknownGroup)
	default:
		f.log.Error().Err(err).Int64("group_id", id).Msg("updating group failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
	}
}

// setGroupsOrderRequest is PUT /api/groups/order's request body (kb:anchor/groups.order).
type setGroupsOrderRequest struct {
	Order []int64 `json:"order"`
}

// handleSetOrder is PUT /api/groups/order (kb:anchor/groups.order).
func (f *groupsFeature) handleSetOrder(w http.ResponseWriter, r *http.Request) {
	var req setGroupsOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Order == nil {
		writeInvalidRequest(w, msgGroupOrder)
		return
	}

	switch err := f.manager.SetGroupsOrder(context.WithoutCancel(r.Context()), req.Order); {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, session.ErrInvalidGroupOrder):
		writeInvalidRequest(w, msgGroupOrder)
	default:
		f.log.Error().Err(err).Msg("ordering groups failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
	}
}

// setAllCollapsedRequest is PUT /api/groups/collapsed's request body (kb:anchor/groups.collapsed).
type setAllCollapsedRequest struct {
	Collapsed *bool `json:"collapsed"`
}

// handleSetAllCollapsed is PUT /api/groups/collapsed (kb:anchor/groups.collapsed).
func (f *groupsFeature) handleSetAllCollapsed(w http.ResponseWriter, r *http.Request) {
	var req setAllCollapsedRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Collapsed == nil {
		writeInvalidRequest(w, msgCollapsedRequired)
		return
	}

	if err := f.manager.SetAllCollapsed(context.WithoutCancel(r.Context()), *req.Collapsed); err != nil {
		f.log.Error().Err(err).Msg("collapsing groups failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// deleteGroupRequest is DELETE /api/groups/{id}'s optional request body
// (kb:anchor/groups.delete); an absent body or Sessions means ungroup.
type deleteGroupRequest struct {
	Sessions *string `json:"sessions"`
	To       *int64  `json:"to"`
}

// deleteGroupResponse is DELETE /api/groups/{id}'s 200 body.
type deleteGroupResponse struct {
	Deleted  bool      `json:"deleted"`
	Sessions batchWire `json:"sessions"`
}

// parseDeleteDisposition validates a delete request against group id and returns what to
// do with the members, writing the 400 itself on a request that cannot be carried out.
func parseDeleteDisposition(w http.ResponseWriter, req deleteGroupRequest, id int64) (session.GroupDisposition, int64, bool) {
	disposition := session.DispositionUngroup
	if req.Sessions != nil {
		disposition = session.GroupDisposition(*req.Sessions)
	}
	switch disposition {
	case session.DispositionUngroup, session.DispositionRemove:
		return disposition, 0, true
	case session.DispositionMove:
		switch {
		case req.To == nil:
			writeInvalidRequest(w, "to is required with sessions move")
		case *req.To == id:
			writeInvalidRequest(w, "to must name another group")
		default:
			return disposition, *req.To, true
		}
	default:
		writeInvalidRequest(w, msgGroupDisposition)
	}
	return "", 0, false
}

// handleDeleteGroup is DELETE /api/groups/{id} (kb:anchor/groups.delete).
func (f *groupsFeature) handleDeleteGroup(w http.ResponseWriter, r *http.Request) {
	id, ok := parseGroupID(w, r)
	if !ok {
		return
	}
	if id == 0 {
		writeInvalidRequest(w, "the Ungrouped section cannot be deleted")
		return
	}

	var req deleteGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeBodyError(w, err, map[string]string{"sessions": msgGroupDisposition, "to": "to is required with sessions move"})
		return
	}
	disposition, to, ok := parseDeleteDisposition(w, req, id)
	if !ok {
		return
	}

	ctx := context.WithoutCancel(r.Context())
	result, err := f.manager.DeleteGroup(ctx, id, disposition, to)
	switch {
	case err == nil:
	case errors.Is(err, session.ErrUnknownGroup):
		writeUnknownGroup(w, msgUnknownGroup)
		return
	case errors.Is(err, session.ErrUnknownTargetGroup):
		writeUnknownGroup(w, "unknown target group")
		return
	default:
		f.log.Error().Err(err).Int64("group_id", id).Msg("deleting group failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		return
	}

	if disposition == session.DispositionRemove {
		for _, sessionID := range result.Sessions.Done {
			f.teardown(ctx, sessionID)
		}
	}
	writeJSON(w, http.StatusOK, deleteGroupResponse{Deleted: result.Deleted, Sessions: toWireBatch(result.Sessions)})
}
