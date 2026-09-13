set -e
API=http://localhost:8080/api/v1
J='Content-Type: application/json'

echo "=== 1. Login / register provider ==="
PROV=$(curl -s -X POST $API/auth/login -H "$J" -d '{"email":"alice@example.com","password":"secret123"}')
if ! echo "$PROV" | grep -q '"token"'; then
  PROV=$(curl -s -X POST $API/auth/register -H "$J" -d '{"full_name":"Owner Alice","email":"alice@example.com","phone_number":"+919800000001","password":"secret123","role":"provider"}')
fi
echo "$PROV" | head -c 200; echo
PROV_TOKEN=$(echo "$PROV" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")

echo "=== 2. Login / register driver ==="
DRV=$(curl -s -X POST $API/auth/login -H "$J" -d '{"email":"bob@example.com","password":"secret123"}')
if ! echo "$DRV" | grep -q '"token"'; then
  DRV=$(curl -s -X POST $API/auth/register -H "$J" -d '{"full_name":"Bob Driver","email":"bob@example.com","phone_number":"+919800000002","password":"secret123","role":"driver"}')
fi
DRV_TOKEN=$(echo "$DRV" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
echo "driver ready"

echo "=== 3. Login / register admin ==="
ADM=$(curl -s -X POST $API/auth/login -H "$J" -d '{"email":"admin@example.com","password":"secret123"}')
if ! echo "$ADM" | grep -q '"token"'; then
  ADM=$(curl -s -X POST $API/auth/register -H "$J" -d '{"full_name":"Admin","email":"admin@example.com","phone_number":"+919800000003","password":"secret123","role":"admin"}')
fi
ADM_TOKEN=$(echo "$ADM" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
echo "admin ready"

echo "=== 4. Create spot (provider) ==="
SPOT=$(curl -s -X POST $API/spots -H "$J" -H "Authorization: Bearer $PROV_TOKEN" -d '{
  "title":"Downtown Garage Bay",
  "description":"Covered bay near station",
  "latitude":12.9716,"longitude":77.5946,
  "address":"MG Road, Bangalore",
  "hourly_rate":80,
  "overstay_multiplier":2.0,
  "geo_radius_meters":50,
  "photos":["https://example.in/p1.jpg"],
  "schedules":[{"dow":[0,1,2,3,4,5,6],"start_time":"00:00","end_time":"23:59"}]
}')
echo "$SPOT" | head -c 600; echo
SPOT_ID=$(echo "$SPOT" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")

echo "=== 5. Search spots radially (driver) ==="
SEARCH=$(curl -s "$API/spots/search?lat=12.9716&lng=77.5946&radius_m=2000" -H "Authorization: Bearer $DRV_TOKEN")
echo "$SEARCH" | head -c 400; echo

echo "=== 6. Create vehicle (driver) ==="
VEH=$(curl -s -X POST $API/vehicles -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d '{"license_plate":"KA01AB1234","make_model":"Tesla Model 3","vehicle_type":"sedan"}')
if echo "$VEH" | grep -q '"id"'; then
  VEH_ID=$(echo "$VEH" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
else
  VEH_ID=$(curl -s $API/vehicles -H "Authorization: Bearer $DRV_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print([v['id'] for v in d if v['license_plate']=='KA01AB1234'][0])")
fi
echo "vehicle ready: $VEH_ID"

echo "=== 7. Lock spot (driver) ==="
LOCK=$(curl -s -X POST $API/bookings/lock -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"spot_id\":\"$SPOT_ID\",\"vehicle_id\":\"$VEH_ID\",\"start_time\":\"$(date -u -d '+5 min' +%Y-%m-%dT%H:%M:%S.000Z)\",\"duration_hours\":2}")
echo "$LOCK" | head -c 600; echo
BOOKING_ID=$(echo "$LOCK" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['booking_id'])")

echo "=== 8. Search again — spot should be locked/excluded ==="
SEARCH2=$(curl -s "$API/spots/search?lat=12.9716&lng=77.5946&radius_m=2000" -H "Authorization: Bearer $DRV_TOKEN")
echo "$SEARCH2" | head -c 300; echo

echo "=== 9. Duplicate lock attempt must fail ==="
DUP=$(curl -s -X POST $API/bookings/lock -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"spot_id\":\"$SPOT_ID\",\"vehicle_id\":\"$VEH_ID\",\"start_time\":\"$(date -u -d '+5 min' +%Y-%m-%dT%H:%M:%S.000Z)\",\"duration_hours\":1}")
echo "$DUP" | head -c 300; echo

echo "=== 10. Confirm payment ==="
CONF=$(curl -s -X POST $API/bookings/$BOOKING_ID/confirm-payment -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"payment_id\":\"pay_$BOOKING_ID\",\"signature\":\"sig_$BOOKING_ID\"}")
echo "$CONF" | head -c 700; echo

echo "=== 11. Check-in with wrong PIN must fail ==="
PIN=$(echo "$CONF" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(d['verification']['pin_code'])")
BAD=$(curl -s -X POST $API/bookings/$BOOKING_ID/check-in -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d '{"method":"pin","pin_code":"0000"}')
echo "$BAD" | head -c 200; echo

echo "=== 12. Check-in via geofence (far away) must fail ==="
FAR=$(curl -s -X POST $API/bookings/$BOOKING_ID/check-in -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d '{"method":"geofence","driver_lat":13.02,"driver_lng":77.60}')
echo "$FAR" | head -c 200; echo

echo "=== 13. Check-in via PIN (correct) succeeds ==="
CI=$(curl -s -X POST $API/bookings/$BOOKING_ID/check-in -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"method\":\"pin\",\"pin_code\":\"$PIN\"}")
echo "$CI" | head -c 400; echo

echo "=== 14. Check-out ==="
CO=$(curl -s -X POST $API/bookings/$BOOKING_ID/check-out -H "$J" -H "Authorization: Bearer $DRV_TOKEN")
echo "$CO" | python3 -m json.tool | head -30

echo "=== 15. Spot searchable again ==="
SEARCH3=$(curl -s "$API/spots/search?lat=12.9716&lng=77.5946&radius_m=2000" -H "Authorization: Bearer $DRV_TOKEN")
echo "$SEARCH3" | head -c 300; echo

echo "=== 16. Provider wallet shows payout ==="
WALLET=$(curl -s $API/payments/wallet -H "Authorization: Bearer $PROV_TOKEN")
echo "$WALLET" | python3 -m json.tool | head -20

echo "=== 17. Admin ledger ==="
LEDGER=$(curl -s $API/admin/ledger -H "Authorization: Bearer $ADM_TOKEN")
echo "$LEDGER" | head -c 400; echo

echo "E2E DONE"