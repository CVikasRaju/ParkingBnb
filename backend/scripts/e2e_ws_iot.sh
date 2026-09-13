set -e
API=http://localhost:8080/api/v1
J='Content-Type: application/json'
STAMP=$(date +%s)

login() { curl -s -X POST $API/auth/login -H "$J" -d "{\"email\":\"$1\",\"password\":\"secret123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])"; }
PROV_TOKEN=$(login alice@example.com)
DRV_TOKEN=$(login bob@example.com)

echo "=== A. Blocked by a concurrent lock: while spot is locked, second lock attempt must fail (race-condition) ==="
SPOT=$(curl -s -X POST $API/spots -H "$J" -H "Authorization: Bearer $PROV_TOKEN" -d '{
  "title":"IoT Garage Spot",
  "description":"Automated barrier",
  "latitude":12.9725,"longitude":77.5955,
  "address":"Tech Park Basement",
  "hourly_rate":80,
  "overstay_multiplier":2,
  "has_iot_barrier":true,
  "iot_device_key":'"\"dev_e2e_gate_$STAMP\""',
  "schedules":[{"dow":[0,1,2,3,4,5,6],"start_time":"00:00","end_time":"23:59"}]
}')
SPOT_ID=$(echo "$SPOT" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
echo "spot=$SPOT_ID"

PLATE="IOT-$STAMP"
VEH_JSON=$(curl -s -X POST $API/vehicles -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"license_plate\":\"$PLATE\",\"make_model\":\"Test EV\",\"vehicle_type\":\"sedan\"}")
if echo "$VEH_JSON" | grep -q '"id"'; then
  VEH_ID=$(echo "$VEH_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
else
  VEH_ID=$(curl -s $API/vehicles -H "Authorization: Bearer $DRV_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print([v['id'] for v in d if v['license_plate']=='$PLATE'][0])")
fi

LOCK=$(curl -s -X POST $API/bookings/lock -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"spot_id\":\"$SPOT_ID\",\"vehicle_id\":\"$VEH_ID\",\"start_time\":\"$(date -u -d '+5 min' +%Y-%m-%dT%H:%M:%S.000Z)\",\"duration_hours\":1}")
BK=$(echo "$LOCK" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['booking_id'])")
echo "--- RACE: second lock attempt while this spot is already locked MUST fail atomically ---"
RACE=$(curl -s -X POST $API/bookings/lock -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"spot_id\":\"$SPOT_ID\",\"vehicle_id\":\"$VEH_ID\",\"start_time\":\"$(date -u -d '+5 min' +%Y-%m-%dT%H:%M:%S.000Z)\",\"duration_hours\":1}")
echo "$RACE" | head -c 200; echo

CONF=$(curl -s -X POST $API/bookings/$BK/confirm-payment -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"payment_id\":\"pay_$BK\",\"signature\":\"sig_$BK\"}")
echo "confirmed: $(echo "$CONF" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['status'])")"

echo ""
echo "=== B. WebSocket: subscribe to spot FIRST, then lock/unlock via lifecycle ==="
cat > /tmp/ws_test.js <<'EOF'
const WebSocket = require("ws");
const ws = new WebSocket("ws://localhost:8080/ws");
const SPOT = process.argv[2];
const targetLocked = process.argv[3] === "true";
let gotLocked = false, gotAvailable = false;
function maybeDone(){
  if (gotLocked && gotAvailable) { ws.close(); }
}
ws.on("open", () => {
  ws.send(JSON.stringify({ op: "subscribe_spot", spot_id: SPOT }));
  console.log("WS_OPEN");
});
ws.on("message", (d) => {
  const e = JSON.parse(String(d));
  console.log("WS_EVENT", JSON.stringify(e));
  if (e.type === "spot_status" && e.spotId === SPOT) {
    if (e.status === "locked") gotLocked = true;
    if (e.status === "available") gotAvailable = true;
    maybeDone();
  }
});
setTimeout(() => {
  if (!(gotLocked && gotAvailable)) { console.log("WS_TIMEOUT locked=" + gotLocked + " available=" + gotAvailable); process.exit(2); }
  process.exit(0);
}, 10000);
EOF

# Fresh spot for the WS part so the locked event happens while subscribed.
SPOTW=$(curl -s -X POST $API/spots -H "$J" -H "Authorization: Bearer $PROV_TOKEN" -d '{
  "title":"WS Spot",
  "description":"",
  "latitude":12.9730,"longitude":77.5960,
  "address":"WS lane",
  "hourly_rate":40,
  "overstay_multiplier":2,
  "schedules":[{"dow":[0,1,2,3,4,5,6],"start_time":"00:00","end_time":"23:59"}]
}')
SPOTW_ID=$(echo "$SPOTW" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
NODE_PATH=/workspace/project/backend/node_modules node /tmp/ws_test.js "$SPOTW_ID" "true" &
WS_PID=$!
sleep 1.2

LOCKW=$(curl -s -X POST $API/bookings/lock -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"spot_id\":\"$SPOTW_ID\",\"vehicle_id\":\"$VEH_ID\",\"start_time\":\"$(date -u -d '+5 min' +%Y-%m-%dT%H:%M:%S.000Z)\",\"duration_hours\":1}")
echo "lock on WS spot: $(echo "$LOCKW" | head -c 120)"
BKW=$(echo "$LOCKW" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['booking_id'])")
sleep 1

echo "--- gate: wrong device key should be rejected ---"
curl -s -X POST http://localhost:8080/api/v1/webhooks/gate -H "$J" -H "X-Device-Key: wrong_key" -d "{\"event_type\":\"plate_detected\",\"license_plate\":\"$PLATE\"}" | head -c 120; echo
echo "--- gate: valid key, unknown plate stays closed ---"
curl -s -X POST http://localhost:8080/api/v1/webhooks/gate -H "$J" -H "X-Device-Key: dev_e2e_gate_$STAMP" -d '{"event_type":"plate_detected","license_plate":"AAA-000"}' | head -c 120; echo
echo "--- gate: valid key + correct plate opens barrier (check-in via iot) ---"
GATE=$(curl -s -X POST http://localhost:8080/api/v1/webhooks/gate -H "$J" -H "X-Device-Key: dev_e2e_gate_$STAMP" -d "{\"event_type\":\"plate_detected\",\"license_plate\":\"$PLATE\"}")
echo "$GATE"

sleep 1
echo "--- gate checkouts below free the IoT spot; the WS spot is freed via cancel -> WS available ---"
CANCEL=$(curl -s -X POST $API/bookings/$BKW/cancel -H "$J" -H "Authorization: Bearer $DRV_TOKEN")
echo "cancel WS-spot booking: $(echo "$CANCEL" | head -c 120)"

sleep 1
echo "--- checkout via barrier exit (vehicle_departure) closes the loop on the IoT spot ---"
GATEX=$(curl -s -X POST http://localhost:8080/api/v1/webhooks/gate -H "$J" -H "X-Device-Key: dev_e2e_gate_$STAMP" -d "{\"event_type\":\"vehicle_departure\",\"license_plate\":\"$PLATE\"}")
echo "$GATEX"
sleep 1.5
wait $WS_PID || echo "ws done"
echo "WS_DONE"