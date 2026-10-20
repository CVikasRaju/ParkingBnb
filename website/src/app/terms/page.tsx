import type { Metadata } from "next";

import LegalPage from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The rules for drivers, hosts and operators on ParkPeer: bookings, escrow, overstay charges, refunds and disputes.",
};

/**
 * ⚠ TEMPLATE — have counsel review this before launch.
 *
 * The clauses below describe what the software actually does (10-minute holds,
 * 85/15 split, 1.5× overstay beyond a 15-minute grace, geofence check-in), so
 * they are a faithful first draft rather than invented policy. The operator
 * details, governing law and jurisdiction are placeholders: they depend on the
 * entity that runs the service and must be filled in by someone qualified to do
 * so.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated="Last updated: 17 October 2026 · draft for legal review"
      intro="ParkPeer connects drivers who need parking with people and businesses that have a space to spare. These terms are the agreement between you and the operator of the ParkPeer platform. By creating an account, listing a bay or booking one, you accept them."
      sections={[
        {
          heading: "1. Who may use ParkPeer",
          paragraphs: [
            "You must be at least 18 years old and able to enter into a binding contract. You must provide accurate details when you register, keep them up to date, and keep your credentials to yourself. Accounts are personal: a host account may be held by a household or a business, but the person who registers it is responsible for everything done through it.",
          ],
        },
        {
          heading: "2. What ParkPeer is — and is not",
          paragraphs: [
            "ParkPeer is a marketplace. The parking space is provided by the host, not by us. We are not the owner, occupier or insurer of any bay, and we do not inspect the spaces listed on the map. Hosts are responsible for having the right to let the space, and for describing it truthfully.",
            "Payments run through our payment provider's escrow: we collect from the driver, hold the funds, and release the host's share after a completed session. We are not a bank and we do not hold your money as a deposit-taking business.",
          ],
        },
        {
          heading: "3. Bookings and the ten-minute hold",
          paragraphs: [
            "When you tap to reserve a bay, ParkPeer takes an exclusive ten-minute hold and pre-authorises the estimated cost. The bay is unavailable to everyone else for that window, so cancelling after the hold is granted may release a bay that another driver could have used.",
            "A hold becomes a reservation once the pre-authorisation is confirmed. If the payment is not confirmed within the hold window, the hold expires and the bay is released automatically. A bay held longer than the window by a technical fault does not create a booking.",
          ],
        },
        {
          heading: "4. Arrival, check-in and departure",
          paragraphs: [
            "You must arrive and check in within the booked period, and leave by the end time you selected. Check-in is verified by a rotating QR code, a four-digit PIN, a GPS geofence check against the bay's coordinates, or an IoT barrier event, and the method used is recorded on the booking.",
            "Checking in from outside the geofence, sharing a QR code or PIN with someone else, or using a bay you did not book is grounds for cancellation of the session without refund and for suspension of the account.",
          ],
        },
        {
          heading: "5. Overstay, unused time and refunds",
          paragraphs: [
            "Sessions are billed in the increments shown on the booking. Overstaying past the booked end time is free for the first 15 minutes; beyond that, the bay's hourly rate multiplied by its overstay multiplier (1.5× by default) is charged for each hour or part-hour that the vehicle remains.",
            "If a host is unable to provide the bay — because it is blocked, occupied or not as described — report it in the app and the booking is refunded to you automatically. The report is reviewed, and a pattern of inaccurate listings will cost the host their listing.",
            "Hosts are paid 85% of the session value; ParkPeer retains a 15% commission. Cancellations by the driver before arrival are refunded in full.",
          ],
        },
        {
          heading: "6. Disputes",
          paragraphs: [
            "Either party may open a dispute from the booking. We review the booking record, the check-in evidence and any IoT gate events, and may adjust a charge one way or the other. Our decision on a disputed charge is final as a matter of the platform contract, without affecting your statutory rights.",
          ],
        },
        {
          heading: "7. Host obligations",
          bullets: [
            "List only space you are entitled to let, and keep the description, price and availability accurate.",
            "Keep the bay clear and accessible for the booked window, and provide any access instructions honestly.",
            "Do not move, block in or damage a driver's vehicle, and do not access it beyond what the booking requires.",
            "Tell us promptly if a bay becomes unavailable so we can cancel affected bookings and refund the drivers.",
          ],
          paragraphs: [],
        },
        {
          heading: "8. Acceptable use",
          paragraphs: [
            "Do not scrape the platform, probe its APIs beyond normal use, interfere with other users' bookings, use the realtime channels to harass anyone, or attempt to pay or be paid outside the platform for a booking made here. We may suspend or close accounts that do, and may remove listings that breach these terms.",
          ],
        },
        {
          heading: "9. Liability",
          paragraphs: [
            "We provide the platform with reasonable skill and care, but it is offered as-is: maps, timings and third-party services can fail. To the extent the law allows, we are not liable for indirect losses, for loss of profit, or for damage to a vehicle occurring on a host's property, which remains a matter between the driver and the host. Nothing here excludes liability that cannot lawfully be excluded.",
          ],
        },
        {
          heading: "10. Changes and governing law",
          paragraphs: [
            "We may update these terms; material changes will be announced in the app before they take effect. If you keep using ParkPeer after that, the new terms apply. They are governed by the laws of [governing jurisdiction], and disputes are subject to the courts of [city, country] — both to be confirmed by the operator before launch.",
          ],
        },
        {
          heading: "11. Contact",
          paragraphs: [
            "Questions about these terms, or about a booking: legal@parkpeer.example or support@parkpeer.example. Replace both addresses with monitored inboxes before launch.",
          ],
        },
      ]}
    />
  );
}
