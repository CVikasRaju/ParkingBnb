set -e
API=http://localhost:8080/api/v1
J='Content-Type: application/json'

login() { curl -s -X POST $API/auth/login -H "$J" -d "{\"email\":\"$1\",\"password\":\"secret123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])"; }
PROV_TOKEN=$(login alice@example.com)
DRV_TOKEN=$(login bob@example.com)
ADM_TOKEN=$(login admin@example.com)

echo "=== A. Overstay flow: create spot+booking, check-in, backdate checkout, verify formula ==="
# Use a fresh spot with high overstay multiplier for visibility
SPOT=$(curl -s -X POST $API/spots -H "$J" -H "Authorization: Bearer $PROV_TOKEN" -d '{
  "title":"Overstay Test Spot",
  "description":"Shopping street",
  "latitude":12.9716,"longitude":77.5946,
  "address":"Commercial St",
  "hourly_rate":100,
  "overstay_multiplier":3,
  "geo_radius_meters":50,
  "schedules":[{"dow":[0,1,2,3,4,5,6],"start_time":"00:00","end_time":"23:59"}]
}')
SPOT_ID=$(echo "$SPOT" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
VEH_JSON=$(curl -s -X POST $API/vehicles -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d '{"license_plate":"KA99XY9999","make_model":"Hyundai i20","vehicle_type":"hatchback"}')
if echo "$VEH_JSON" | grep -q '"id"'; then
  VEH_ID=$(echo "$VEH_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
else
  VEH_ID=$(curl -s $API/vehicles -H "Authorization: Bearer $DRV_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print([v['id'] for v in d if v['license_plate']=='KA99XY9999'][0])")
fi
LOCK=$(curl -s -X POST $API/bookings/lock -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"spot_id\":\"$SPOT_ID\",\"vehicle_id\":\"$VEH_ID\",\"start_time\":\"$(date -u -d '+5 min' +%Y-%m-%dT%H:%M:%S.000Z)\",\"duration_hours\":1}")
BK=$(echo "$LOCK" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['booking_id'])")
echo "booking=$BK"
CONFIRM=$(curl -s -X POST $API/bookings/$BK/confirm-payment -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"payment_id\":\"pay_$BK\",\"signature\":\"sig_$BK\"}")
PIN=$(echo "$CONFIRM" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['verification']['pin_code'])")
curl -s -X POST $API/bookings/$BK/check-in -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"method\":\"pin\",\"pin_code\":\"$PIN\"}" > /dev/null
echo "checked in"

# Backdate the session to force 50 min of overstay beyond expected_end.
# goal: actual parked = 170 min (now - check_in), booked = 120 min => 50 over
sudo docker exec parkpeer-postgres psql -U parkpeer -d parkpeer -c "UPDATE bookings SET start_time = now() - interval '290 minutes', expected_end_time = now() - interval '170 minutes', actual_check_in = now() - interval '170 minutes' WHERE id = '$BK';" > /dev/null
CO=$(curl -s -X POST $API/bookings/$BK/check-out -H "$J" -H "Authorization: Bearer $DRV_TOKEN")
echo "checkout after overstay:"; echo "$CO" | python3 -m json.tool
# Expected: overstay 50 min > 15 grace -> ceil(50/60)=1h * 100 * 3 = 300
# base 100, gross 400, platform 60, provider 340

echo ""
echo "=== B. Blocked-spot report with auto-refund ==="
SPOT2=$(curl -s -X POST $API/spots -H "$J" -H "Authorization: Bearer $PROV_TOKEN" -d '{
  "title":"Blocked Spot Test",
  "description":"",
  "latitude":12.9750,"longitude":77.6000,
  "address":"Side lane",
  "hourly_rate":50,
  "overstay_multiplier":2,
  "schedules":[{"dow":[0,1,2,3,4,5,6],"start_time":"00:00","end_time":"23:59"}]
}')
SPOT2_ID=$(echo "$SPOT2" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
LOCK3=$(curl -s -X POST $API/bookings/lock -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"spot_id\":\"$SPOT2_ID\",\"vehicle_id\":\"$VEH_ID\",\"start_time\":\"$(date -u -d '+5 min' +%Y-%m-%dT%H:%M:%S.000Z)\",\"duration_hours\":1}")
BK3=$(echo "$LOCK3" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['booking_id'])")
echo "locked booking=$BK3"
# Confirm payment + check-in, then driver reports the spot blocked.
CONF3=$(curl -s -X POST $API/bookings/$BK3/confirm-payment -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"payment_id\":\"pay_$BK3\",\"signature\":\"sig_$BK3\"}")
PIN3=$(echo "$CONF3" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['verification']['pin_code'])")
curl -s -X POST $API/bookings/$BK3/check-in -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"method\":\"pin\",\"pin_code\":\"$PIN3\"}" > /dev/null
DIS=$(curl -s -X POST $API/disputes/report -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"booking_id\":\"$BK3\",\"reason\":\"spot_blocked\",\"description\":\"Another vehicle was parked there\"}")
echo "$DIS" | head -c 300; echo
DIS_ID=$(echo "$DIS" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['dispute_id'])")
echo "=== C2. Refund ledger entry for driver ==="
sudo docker exec parkpeer-postgres psql -U parkpeer -d parkpeer -c "SELECT booking_id, amount, created_at FROM refund_ledger WHERE booking_id = '$BK3';"

echo "=== C3. Admin resolves dispute -> refund confirmed ==="
RES=$(curl -s -X PATCH $API/admin/disputes/$DIS_ID -H "$J" -H "Authorization: Bearer $ADM_TOKEN" -d '{"action":"refund","admin_notes":"Verified via photos"}')
echo "$RES" | head -c 300; echo

echo ""
echo "=== D. Emergency unlock: lock a spot, abandon it, unlock via admin ==="
SPOT3=$(curl -s -X POST $API/spots -H "$J" -H "Authorization: Bearer $PROV_TOKEN" -d '{
  "title":"Orphan Lock Spot",
  "description":"",
  "latitude":12.9760,"longitude":77.6010,
  "address":"Another lane",
  "hourly_rate":50,
  "overstay_multiplier":2,
  "schedules":[{"dow":[0,1,2,3,4,5,6],"start_time":"00:00","end_time":"23:59"}]
}')
SPOT3_ID=$(echo "$SPOT3" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
LOCK4=$(curl -s -X POST $API/bookings/lock -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"spot_id\":\"$SPOT3_ID\",\"vehicle_id\":\"$VEH_ID\",\"start_time\":\"$(date -u -d '+5 min' +%Y-%m-%dT%H:%M:%S.000Z)\",\"duration_hours\":1}")
BK4=$(echo "$LOCK4" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['booking_id'])")
echo "locked booking=$BK4 (driver abandons before payment)"
# Search must exclude the locked spot
STILL=$(curl -s "$API/spots/search?lat=12.9760&lng=77.6010&radius_m=200" -H "Authorization: Bearer $DRV_TOKEN")
echo "search before unlock: $(echo "$STILL" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['data']))") spots visible"
UL=$(curl -s -X POST $API/admin/locks/unlock -H "$J" -H "Authorization: Bearer $ADM_TOKEN" -d "{\"booking_id\":\"$BK4\"}")
echo "emergency unlock: $UL"
LOCK5=$(curl -s -X POST $API/bookings/lock -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"spot_id\":\"$SPOT3_ID\",\"vehicle_id\":\"$VEH_ID\",\"start_time\":\"$(date -u -d '+5 min' +%Y-%m-%dT%H:%M:%S.000Z)\",\"duration_hours\":1}")
echo "relock after unlock: $(echo "$LOCK5" | head -c 150)"

echo "SPRINT3/4 DONE"