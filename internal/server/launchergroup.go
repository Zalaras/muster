package server

import "github.com/Zalaras/muster/internal/session"

// launchGroup is where a launch puts its session: an existing group (id), a group to create
// with the session (newName, already trimmed), or neither.
type launchGroup struct {
	id      *int64
	newName string
}

// resolveLaunchGroup checks req's groupId and newGroup, the launch's last pure step: it
// runs after every other invalid_request rule and the model check and before anything is
// written, so a refusal needs no rollback.
func (l *sessionLauncher) resolveLaunchGroup(req createSessionRequest) (launchGroup, *launchError) {
	if len(req.GroupID) > 0 && req.NewGroup != nil {
		return launchGroup{}, invalidRequest("groupId and newGroup cannot be combined")
	}
	if req.NewGroup != nil {
		name, ok := session.NormalizeGroupName(*req.NewGroup)
		if !ok {
			return launchGroup{}, invalidRequest(msgGroupNameBounds)
		}
		return launchGroup{newName: name}, nil
	}
	if len(req.GroupID) == 0 {
		return launchGroup{}, nil
	}
	id, ok := decodeGroupID(req.GroupID)
	if !ok {
		return launchGroup{}, invalidRequest(msgGroupIDField)
	}
	if id != nil && !l.manager.GroupExists(*id) {
		return launchGroup{}, unknownGroup()
	}
	return launchGroup{id: id}, nil
}
