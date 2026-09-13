set -e
API=http://localhost:8080/api/v1
J='Content-Type: application/json'

login() { curl -s -X POST $API/auth/login -H "$J" -d "{\"email\":\"$1\",\"password\":\"secret123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])"; }
PROV_TOKEN=$(login alice@example.com)
DRV_TOKEN=$(login bob@example.com)

SPOT=$(curl -s -X POST $API/spots -H "$J" -H "Authorization: Bearer $PROV_TOKEN" -d '{
  "title":"Overstay Worker Spot",
  "description":"",
  "latitude":12.9720,"longitude":77.5940,
  "address":"Worker lane",
  "hourly_rate":60,
  "overstay_multiplier":2,
  "schedules":[{"dow":[0,1,2,3,4,5,6],"start_time":"00:00","end_time":"23:59"}]
}')
SPOT_ID=$(echo "$SPOT" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")

PLATE="WRK-$(date +%s)"
VEH_JSON=$(curl -s -X POST $API/vehicles -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"license_plate\":\"$PLATE\",\"make_model\":\"Worker Car\",\"vehicle_type\":\"hatchback\"}")
if echo "$VEH_JSON" | grep -q '"id"'; then VEH_ID=$(echo "$VEH_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])"); fi

LOCK=$(curl -s -X POST $API/bookings/lock -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"spot_id\":\"$SPOT_ID\",\"vehicle_id\":\"$VEH_ID\",\"start_time\":\"$(date -u -d '+5 min' +%Y-%m-%dT%H:%M:%S.000Z)\",\"duration_hours\":1}")
BK=$(echo "$LOCK" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['booking_id'])")
CONF=$(curl -s -X POST $API/bookings/$BK/confirm-payment -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"payment_id\":\"pay_$BK\",\"signature\":\"sig_$BK\"}")
PIN=$(echo "$CONF" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['verification']['pin_code'])")
curl -s -X POST $API/bookings/$BK/check-in -H "$J" -H "Authorization: Bearer $DRV_TOKEN" -d "{\"method\":\"pin\",\"pin_code\":\"$PIN\"}" > /dev/null
echo "checked in: $BK"

# Worker flags: same UPDATE the worker runs (checked_in -> overstayed) once end passes.
sudo docker exec parkpeer-postgres psql -U parkpeer -d parkpeer -c "UPDATE bookings SET expected_end_time = now() - interval '40 minutes', start_time = now() - interval '100 minutes', actual_check_in = now() - interval '95 minutes' WHERE id = '$BK';" > /dev/null
sudo docker exec parkpeer-postgres psql -U parkpeer -d parkpeer -c "UPDATE bookings SET status='overstayed' WHERE id='$BK' AND status='checked_in';" > /dev/null
STATUS=$(sudo docker exec parkpeer-postgres psql -U parkpeer -d parkpeer -t -c "SELECT status FROM bookings WHERE id='$BK';" | tr -d ' \n')
echo "status after worker-style flag: $STATUS"

CO=$(curl -s -X POST $API/bookings/$BK/check-out -H "$J" -H "Authorization: Bearer $DRV_TOKEN")
echo "checkout from overstayed:"
echo "$CO" | python3 -m json.tool
echo "OVERSTAY_WORKER_DONE"