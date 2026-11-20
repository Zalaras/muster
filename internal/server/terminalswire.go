package server

type terminalWire struct {
	N    int    `json:"n"`
	Name string `json:"name"`
	Busy bool   `json:"busy"`
}

type terminalsMessage struct {
	Type      string         `json:"type"`
	SessionID int64          `json:"sessionId"`
	Terminals []terminalWire `json:"terminals"`
}
