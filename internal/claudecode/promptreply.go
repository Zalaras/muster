package claudecode

import "encoding/json"

const eventUserPromptSubmit = "UserPromptSubmit"

func IsPromptSubmit(eventType string) bool {
	return eventType == eventUserPromptSubmit
}

type promptReply struct {
	HookSpecificOutput promptReplyOutput `json:"hookSpecificOutput"`
}

type promptReplyOutput struct {
	HookEventName string `json:"hookEventName"`
	SessionTitle  string `json:"sessionTitle"`
}

func PromptTitleReply(title string) []byte {
	b, err := json.Marshal(promptReply{HookSpecificOutput: promptReplyOutput{
		HookEventName: eventUserPromptSubmit,
		SessionTitle:  title,
	}})
	if err != nil {
		panic(err)
	}
	return b
}
