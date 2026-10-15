package claudecodetest

import "encoding/json"

func PromptReplyTitle(body []byte) (title string, ok bool) {
	var reply struct {
		HookSpecificOutput *struct {
			HookEventName string `json:"hookEventName"`
			SessionTitle  string `json:"sessionTitle"`
		} `json:"hookSpecificOutput"`
	}
	if err := json.Unmarshal(body, &reply); err != nil || reply.HookSpecificOutput == nil {
		return "", false
	}
	if reply.HookSpecificOutput.HookEventName != "UserPromptSubmit" {
		return "", false
	}
	return reply.HookSpecificOutput.SessionTitle, true
}
