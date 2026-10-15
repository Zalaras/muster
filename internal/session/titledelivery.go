package session

type titleDelivery struct {
	active bool
	value  string
	before string
}

func (s *Session) titleDelivered() bool {
	return s.TitleOverride != nil && s.titleDelivery.active && s.titleDelivery.value == *s.TitleOverride
}

func (s *Session) pendingTitle() (string, bool) {
	if s.TitleOverride == nil || s.titleDelivered() || stringPtrEqual(s.TitleOverride, s.Title) {
		return "", false
	}
	return *s.TitleOverride, true
}

func (s *Session) deliverTitle(before *string) {
	s.titleDelivery = titleDelivery{active: true, value: *s.TitleOverride}
	if before != nil {
		s.titleDelivery.before = *before
	}
}

func (s *Session) takeTitle() (string, bool) {
	if s.TitleOverride == nil || s.titleDelivered() {
		return "", false
	}
	send := !stringPtrEqual(s.TitleOverride, s.Title)
	s.deliverTitle(s.Title)
	return *s.TitleOverride, send
}

func (s *Session) rearmTitleDelivery() {
	s.titleDelivery = titleDelivery{}
	if s.TitleOverride != nil && stringPtrEqual(s.TitleOverride, s.Title) {
		s.deliverTitle(s.Title)
	}
}

func (s *Session) observeClaudeTitle(prev *string) (cleared bool) {
	if s.TitleOverride == nil || s.Title == nil {
		return false
	}
	if !s.titleDelivered() {
		if *s.Title == *s.TitleOverride {
			s.deliverTitle(prev)
		}
		return false
	}
	if *s.Title == *s.TitleOverride || *s.Title == s.titleDelivery.before {
		return false
	}
	s.TitleOverride = nil
	s.titleDelivery = titleDelivery{}
	return true
}

func (m *Manager) TakeTitleToSend(id int64) (string, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[id]
	if !ok {
		return "", false
	}
	return sess.takeTitle()
}

func (m *Manager) PendingTitle(id int64) (string, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[id]
	if !ok {
		return "", false
	}
	return sess.pendingTitle()
}

func (m *Manager) MarkTitleSent(id int64, title string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[id]
	if !ok || sess.TitleOverride == nil || *sess.TitleOverride != title {
		return
	}
	sess.takeTitle()
}
