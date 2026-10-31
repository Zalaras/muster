package claudecode

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var cacheAnchor = time.Unix(1790840879, 0).UTC()

func requestsPtr(n int64) *int64 { return &n }

// TestInterpretStatus_PromptCacheRequestsAndWarm reads the two keys the keep-alive prediction
// needs out of the measured prompt_cache objects (kb:fact/prompt-cache-status-shape,
// kb:fact/prompt-cache-5m-keepalive): requests only as a JSON integer, and cold only for a
// JSON false. An absent key, a null or a string is unknown, never a count and never cold.
func TestInterpretStatus_PromptCacheRequestsAndWarm(t *testing.T) {
	const measured1h = `{"warm":true,"ttl":"1h","expires_at":1790840879,"caching_observed":true,"requests":10,` +
		`"hit_ratio":0.966,"cache_write_tokens":13797,"recache_tokens_if_cold":null,"misses":0}`
	const cold5m = `{"warm":false,"ttl":"5m","expires_at":1790840879,"caching_observed":true,"requests":4,` +
		`"hit_ratio":0.91,"misses":1,"last_miss_cause":"ttl_expired_1h"}`
	tests := []struct {
		name         string
		cache        string
		wantRequests *int64
		wantCold     bool
	}{
		{"measured one-hour object", measured1h, requestsPtr(10), false},
		{"measured cold five-minute object", cold5m, requestsPtr(4), true},
		{"a count of zero is a count", `{"expires_at":1790840879,"ttl":"5m","requests":0}`, requestsPtr(0), false},
		{"requests absent (older versions, resumed process before its first request)", `{"warm":true,"expires_at":1790840879,"ttl":"5m"}`, nil, false},
		{"requests null", `{"expires_at":1790840879,"ttl":"5m","requests":null}`, nil, false},
		{"requests a string", `{"expires_at":1790840879,"ttl":"5m","requests":"3"}`, nil, false},
		{"requests fractional", `{"expires_at":1790840879,"ttl":"5m","requests":3.5}`, nil, false},
		{"requests with a zero fraction", `{"expires_at":1790840879,"ttl":"5m","requests":3.0}`, nil, false},
		{"requests overflowing int64", `{"expires_at":1790840879,"ttl":"5m","requests":99999999999999999999}`, nil, false},
		{"requests a bool", `{"expires_at":1790840879,"ttl":"5m","requests":true}`, nil, false},
		{"warm absent is not cold", `{"expires_at":1790840879,"ttl":"5m","requests":3}`, requestsPtr(3), false},
		{"warm null is not cold", `{"warm":null,"expires_at":1790840879,"ttl":"5m","requests":3}`, requestsPtr(3), false},
		{"warm the string false is not cold", `{"warm":"false","expires_at":1790840879,"ttl":"5m","requests":3}`, requestsPtr(3), false},
		{"warm zero is not cold", `{"warm":0,"expires_at":1790840879,"ttl":"5m","requests":3}`, requestsPtr(3), false},
		{"warm false without requests", `{"warm":false,"expires_at":1790840879,"ttl":"5m"}`, nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := InterpretStatus([]byte(`{"session_id":"claude-1","prompt_cache":` + tt.cache + `}`))

			require.NotNil(t, got.Cache)
			assert.Equal(t, tt.wantRequests, got.Cache.Requests)
			assert.Equal(t, tt.wantCold, got.Cache.Cold)
			assert.True(t, cacheAnchor.Equal(got.Cache.ExpiresAt), "the reported expiry is carried verbatim whatever the new keys say")
		})
	}

	t.Run("an unusable expiry or ttl is no cache even with requests and warm false", func(t *testing.T) {
		got := InterpretStatus([]byte(`{"session_id":"claude-1","prompt_cache":{"warm":false,"expires_at":null,"ttl":"5m","requests":3}}`))

		assert.Nil(t, got.Cache)
	})
}

// TestStatusCacheLifetime is the cache-lifetime prediction as a pure function of one reading and the
// last adopted request count: a 5m-class ttl with a changed count is a request, so the cache is
// held an hour of keep-alives plus the ttl past it; the same count is a keep-alive (not
// adopted); warm false is the post's own expiry; a ttl of an hour or more, or no count, is the
// report as it came.
func TestStatusCacheLifetime(t *testing.T) {
	at := func(s int64) time.Time { return cacheAnchor.Add(time.Duration(s) * time.Second) }
	tests := []struct {
		name   string
		cache  StatusCache
		last   *int64
		want   CacheLifetime
		wantOK bool
	}{
		{"5m request with none adopted", StatusCache{ExpiresAt: at(300), TTLSeconds: 300, Requests: requestsPtr(3)}, nil,
			CacheLifetime{ExpiresAt: at(3900), TTLSeconds: 3900}, true},
		{"5m request, count changed", StatusCache{ExpiresAt: at(700), TTLSeconds: 300, Requests: requestsPtr(4)}, requestsPtr(3),
			CacheLifetime{ExpiresAt: at(4300), TTLSeconds: 3900}, true},
		{"resumed process counter restarts at 1", StatusCache{ExpiresAt: at(300), TTLSeconds: 300, Requests: requestsPtr(1)}, requestsPtr(7),
			CacheLifetime{ExpiresAt: at(3900), TTLSeconds: 3900}, true},
		{"keep-alive, same count, later expiry", StatusCache{ExpiresAt: at(330), TTLSeconds: 300, Requests: requestsPtr(3)}, requestsPtr(3),
			CacheLifetime{}, false},
		{"keep-alive, same count, earlier expiry", StatusCache{ExpiresAt: at(100), TTLSeconds: 300, Requests: requestsPtr(3)}, requestsPtr(3),
			CacheLifetime{}, false},
		{"warm false, same count: the post's own expiry", StatusCache{ExpiresAt: at(330), TTLSeconds: 300, Requests: requestsPtr(3), Cold: true}, requestsPtr(3),
			CacheLifetime{ExpiresAt: at(330), TTLSeconds: 3900}, true},
		{"warm false, none adopted", StatusCache{ExpiresAt: at(330), TTLSeconds: 300, Requests: requestsPtr(3), Cold: true}, nil,
			CacheLifetime{ExpiresAt: at(330), TTLSeconds: 3900}, true},
		{"warm false, count changed", StatusCache{ExpiresAt: at(330), TTLSeconds: 300, Requests: requestsPtr(4), Cold: true}, requestsPtr(3),
			CacheLifetime{ExpiresAt: at(330), TTLSeconds: 3900}, true},
		{"59m is under the hour", StatusCache{ExpiresAt: at(3540), TTLSeconds: 3540, Requests: requestsPtr(3)}, nil,
			CacheLifetime{ExpiresAt: at(7140), TTLSeconds: 7140}, true},
		{"60m is not", StatusCache{ExpiresAt: at(3600), TTLSeconds: 3600, Requests: requestsPtr(3)}, nil,
			CacheLifetime{ExpiresAt: at(3600), TTLSeconds: 3600}, true},
		{"1h, same count: never a keep-alive", StatusCache{ExpiresAt: at(3600), TTLSeconds: 3600, Requests: requestsPtr(3)}, requestsPtr(3),
			CacheLifetime{ExpiresAt: at(3600), TTLSeconds: 3600}, true},
		{"1h, warm false: the post's own expiry, ttl as reported", StatusCache{ExpiresAt: at(1800), TTLSeconds: 3600, Requests: requestsPtr(3), Cold: true}, requestsPtr(3),
			CacheLifetime{ExpiresAt: at(1800), TTLSeconds: 3600}, true},
		{"2h", StatusCache{ExpiresAt: at(7200), TTLSeconds: 7200, Requests: requestsPtr(3)}, nil,
			CacheLifetime{ExpiresAt: at(7200), TTLSeconds: 7200}, true},
		{"no requests, 5m: as reported", StatusCache{ExpiresAt: at(300), TTLSeconds: 300}, nil,
			CacheLifetime{ExpiresAt: at(300), TTLSeconds: 300}, true},
		{"no requests, 5m, a count held: as reported", StatusCache{ExpiresAt: at(330), TTLSeconds: 300}, requestsPtr(3),
			CacheLifetime{ExpiresAt: at(330), TTLSeconds: 300}, true},
		{"no requests, warm false: as reported", StatusCache{ExpiresAt: at(300), TTLSeconds: 300, Cold: true}, nil,
			CacheLifetime{ExpiresAt: at(300), TTLSeconds: 300}, true},
		{"90s", StatusCache{ExpiresAt: at(90), TTLSeconds: 90, Requests: requestsPtr(2)}, nil,
			CacheLifetime{ExpiresAt: at(3690), TTLSeconds: 3690}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := tt.cache.Lifetime(tt.last)

			assert.Equal(t, tt.wantOK, ok)
			assert.True(t, tt.want.ExpiresAt.Equal(got.ExpiresAt), "expiresAt want %s got %s", tt.want.ExpiresAt, got.ExpiresAt)
			assert.Equal(t, tt.want.TTLSeconds, got.TTLSeconds)
		})
	}
}

// TestStatusCacheLifetime_IsAPureReading: the prediction reads neither a clock nor its inputs'
// pointers, so asking twice, or after mutating the held count, gives the same answer.
func TestStatusCacheLifetime_IsAPureReading(t *testing.T) {
	cache := StatusCache{ExpiresAt: cacheAnchor.Add(300 * time.Second), TTLSeconds: 300, Requests: requestsPtr(3)}
	last := requestsPtr(2)

	first, firstOK := cache.Lifetime(last)
	second, secondOK := cache.Lifetime(last)

	assert.Equal(t, first, second)
	assert.Equal(t, firstOK, secondOK)
	assert.Equal(t, int64(2), *last, "the held count is only read")
	assert.Equal(t, int64(3), *cache.Requests)
}

// TestCacheAtExit: an ended session's keep-alives are over, so its warmth is the earlier of the
// predicted expiry and the last one Claude Code reported.
func TestCacheAtExit(t *testing.T) {
	at := func(s int64) time.Time { return cacheAnchor.Add(time.Duration(s) * time.Second) }
	tests := []struct {
		name                  string
		predicted, lastReport time.Time
		want                  time.Time
	}{
		{"reported is earlier: the reported", at(3900), at(330), at(330)},
		{"predicted is earlier: unchanged", at(300), at(330), at(300)},
		{"equal", at(300), at(300), at(300)},
		{"one hour regime reports its own expiry", at(3600), at(3600), at(3600)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CacheAtExit(tt.predicted, tt.lastReport)

			assert.True(t, tt.want.Equal(got), "want %s got %s", tt.want, got)
		})
	}
}
