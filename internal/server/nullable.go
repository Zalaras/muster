package server

import "encoding/json"

func decodeNullable[T any](raw json.RawMessage) (value *T, ok bool) {
	if string(raw) == "null" {
		return nil, true
	}
	var v T
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, false
	}
	return &v, true
}
