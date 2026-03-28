#!/bin/bash
# ShuChat Smoke Test Script — tests core Matrix functionality via guest accounts

GUEST_API="http://localhost:3001/api/guest-register"
MATRIX_URL="https://matrix.shugan.dev"
LOBBY_ROOM="!VYyVtdcYXwSGuNbdEf:shugan.dev"
ENCODED_LOBBY="%21VYyVtdcYXwSGuNbdEf%3Ashugan.dev"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0

check() {
  if [ "$2" = "true" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — $1"; ((PASS++))
  else
    echo -e "  ${RED}✗ FAIL${NC} — $1"; ((FAIL++))
  fi
}

echo ""
echo "========================================="
echo "  ShuChat Smoke Tests"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="

# 1 — Guest creation
echo -e "\n${YELLOW}[1/7] Guest Account Creation${NC}"
G1=$(curl -sf -X POST "$GUEST_API" -H "Content-Type: application/json" -d '{"nickname":"Smoke1"}')
G1_TOKEN=$(echo "$G1" | jq -r '.accessToken // empty')
G1_UID=$(echo "$G1" | jq -r '.userId // empty')
G1_DEV=$(echo "$G1" | jq -r '.deviceId // empty')
check "Got accessToken" "$([ -n "$G1_TOKEN" ] && echo true || echo false)"
check "Got userId" "$([ -n "$G1_UID" ] && echo true || echo false)"
check "Got deviceId" "$([ -n "$G1_DEV" ] && echo true || echo false)"
[ -n "$G1_UID" ] && echo "       → $G1_UID"

# 2 — Verify identity
echo -e "\n${YELLOW}[2/7] Verify Identity (whoami)${NC}"
WHOAMI=$(curl -sf "$MATRIX_URL/_matrix/client/v3/account/whoami" -H "Authorization: Bearer $G1_TOKEN")
WHOAMI_ID=$(echo "$WHOAMI" | jq -r '.user_id // empty')
check "whoami matches userId" "$([ "$WHOAMI_ID" = "$G1_UID" ] && echo true || echo false)"

# 3 — Join lobby
echo -e "\n${YELLOW}[3/7] Join Lobby Room${NC}"
JOIN=$(curl -sf -X POST "$MATRIX_URL/_matrix/client/v3/join/$ENCODED_LOBBY" \
  -H "Authorization: Bearer $G1_TOKEN" -H "Content-Type: application/json" -d '{}')
JOIN_RID=$(echo "$JOIN" | jq -r '.room_id // empty')
check "Joined lobby" "$([ -n "$JOIN_RID" ] && echo true || echo false)"

# 4 — Send message
echo -e "\n${YELLOW}[4/7] Send Message${NC}"
TXNID="smoke_$(date +%s)_$$"
MSG="[SmokeTest] $(date '+%H:%M:%S')"
SEND=$(curl -sf -X PUT \
  "$MATRIX_URL/_matrix/client/v3/rooms/$ENCODED_LOBBY/send/m.room.message/$TXNID" \
  -H "Authorization: Bearer $G1_TOKEN" -H "Content-Type: application/json" \
  -d "{\"msgtype\":\"m.text\",\"body\":\"$MSG\"}")
EVT_ID=$(echo "$SEND" | jq -r '.event_id // empty')
check "Message sent" "$([ -n "$EVT_ID" ] && echo true || echo false)"
[ -n "$EVT_ID" ] && echo "       → $EVT_ID"

# 5 — Verify message
echo -e "\n${YELLOW}[5/7] Verify Message in Room${NC}"
MSGS=$(curl -sf "$MATRIX_URL/_matrix/client/v3/rooms/$ENCODED_LOBBY/messages?dir=b&limit=5" \
  -H "Authorization: Bearer $G1_TOKEN")
FOUND=$(echo "$MSGS" | jq -r ".chunk[]? | select(.event_id == \"$EVT_ID\") | .event_id")
check "Message in history" "$([ "$FOUND" = "$EVT_ID" ] && echo true || echo false)"

# 6 — Second guest + cross-user
echo -e "\n${YELLOW}[6/7] Second Guest + Cross-User${NC}"
G2=$(curl -sf -X POST "$GUEST_API" -H "Content-Type: application/json" -d '{"nickname":"Smoke2"}')
G2_TOKEN=$(echo "$G2" | jq -r '.accessToken // empty')
G2_UID=$(echo "$G2" | jq -r '.userId // empty')
check "Second guest created" "$([ -n "$G2_TOKEN" ] && echo true || echo false)"
[ -n "$G2_UID" ] && echo "       → $G2_UID"

JOIN2=$(curl -sf -X POST "$MATRIX_URL/_matrix/client/v3/join/$ENCODED_LOBBY" \
  -H "Authorization: Bearer $G2_TOKEN" -H "Content-Type: application/json" -d '{}')
check "Guest2 joined lobby" "$([ -n "$(echo $JOIN2 | jq -r '.room_id // empty')" ] && echo true || echo false)"

MSGS2=$(curl -sf "$MATRIX_URL/_matrix/client/v3/rooms/$ENCODED_LOBBY/messages?dir=b&limit=10" \
  -H "Authorization: Bearer $G2_TOKEN")
FOUND2=$(echo "$MSGS2" | jq -r ".chunk[]? | select(.event_id == \"$EVT_ID\") | .event_id")
check "Guest2 sees Guest1's message" "$([ "$FOUND2" = "$EVT_ID" ] && echo true || echo false)"

# 7 — Cleanup
echo -e "\n${YELLOW}[7/7] Cleanup${NC}"
if [ -n "$EVT_ID" ]; then
  REDACT_TX="redact_$(date +%s)_$$"
  ENCODED_EVT=$(echo "$EVT_ID" | sed 's/\$/%24/g')
  REDACT=$(curl -sf -X PUT \
    "$MATRIX_URL/_matrix/client/v3/rooms/$ENCODED_LOBBY/redact/$ENCODED_EVT/$REDACT_TX" \
    -H "Authorization: Bearer $G1_TOKEN" -H "Content-Type: application/json" \
    -d '{"reason":"smoke test cleanup"}')
  check "Test message redacted" "$([ -n "$(echo $REDACT | jq -r '.event_id // empty')" ] && echo true || echo false)"
else
  check "Test message redacted" "false"
fi

# Summary
echo ""
echo "========================================="
TOTAL=$((PASS + FAIL))
echo -e "  Results: ${GREEN}$PASS passed${NC} / ${RED}$FAIL failed${NC} / $TOTAL total"
[ "$FAIL" -eq 0 ] && echo -e "  ${GREEN}ALL TESTS PASSED ✓${NC}" || echo -e "  ${RED}SOME TESTS FAILED ✗${NC}"
echo "========================================="
echo "  Guests: $G1_UID, $G2_UID"
echo ""
exit $FAIL
