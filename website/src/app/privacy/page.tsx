import type { Metadata } from "next";

import LegalPage from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What ParkPeer collects, why, who processes it, how long it is kept and how to get it deleted.",
};

/**
 * ⚠ TEMPLATE — have counsel review this before launch.
 *
 * It is written against what the code actually does: Supabase for accounts and
 * data, a payment provider for escrow, Firebase Cloud Messaging for push, and
 * the fields the schema and the server actions really store (plate, GPS on
 * check-in, gate events, wallet ledger). The entity name, contact addresses and
 * the retention/DPO wording are placeholders.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="Last updated: 17 October 2026 · draft for legal review"
      intro="ParkPeer handles personal data to run a two-sided parking marketplace: it has to know who you are, where the bay is, when you arrived and how the money moved. This page says exactly what that means. Replace the placeholder entity, addresses and retention periods before launch."
      sections={[
        {
          heading: "What we collect",
          bullets: [
            "Account: your name, email address, phone number, role (driver, host or operator) and authentication data. Passwords are handled by our authentication provider; we never store them in the clear.",
            "Vehicles: the plates you register, so a host and an IoT barrier can identify the car.",
            "Bookings: the bay, the vehicle, start and end times, amounts, the PIN/QR verification method and whether check-in happened inside the geofence.",
            "Location: the coordinates you send at check-in, used only to test the bay's 50-metre geofence. Background location is not collected.",
            "Payments: the amounts, the provider's transaction reference and the payout ledger. Card details go directly to the payment provider; they never reach our servers.",
            "Technical: IP address, request identifiers, timestamps and the audit trail of who changed a booking, a bay, a wallet balance or a role.",
          ],
          paragraphs: [],
        },
        {
          heading: "Why we use it",
          paragraphs: [
            "To create and secure your account, to hold a bay for ten minutes while payment is authorised, to let a host or a barrier verify the right car, to bill the session and pay the host, to resolve disputes, and to keep the platform free of fraud and abuse. Where our legitimate interest is the basis (fraud prevention, security logging), we balance it against your rights and keep the data to the minimum that does the job.",
          ],
        },
        {
          heading: "Who processes it",
          paragraphs: [
            "We use a small number of processors, each under a data-processing agreement: Supabase (database, authentication and realtime), our payment provider for escrow (Razorpay or Stripe, depending on region), Firebase Cloud Messaging for push notifications, and our hosting provider for the web platform and API. Our mapping tiles come from OpenFreeMap, which receives the tile requests your browser makes.",
          ],
        },
        {
          heading: "Where it goes",
          paragraphs: [
            "Data is stored in the region you deploy in — set the Supabase project region and the API host deliberately, because moving a database region later is a migration, not a setting. Transfers outside your region rely on the provider's standard contractual clauses. We do not sell personal data and we do not share it with advertisers.",
          ],
        },
        {
          heading: "How long we keep it",
          paragraphs: [
            "Account and vehicle data live as long as the account does. Bookings, settlement and refund records, and the audit log are kept for [retention period, e.g. 7 years] because tax and dispute rules require financial records to survive account deletion. Location and verification evidence (geofence result, gate events) is kept with the booking for the same reason. Server logs are rotated after 30 days.",
          ],
        },
        {
          heading: "Your rights",
          paragraphs: [
            "You can access and correct your profile from the app, export your booking history on request, and ask us to delete your account. Deletion removes your profile and vehicles and anonymises your booking history so the financial record stays intact; if you need the full record erased, tell us and we will explain what can and cannot go. Depending on where you live you may also have the right to object to processing, to restrict it, and to complain to your data-protection authority.",
          ],
        },
        {
          heading: "Cookies",
          paragraphs: [
            "The web console sets a single first-party cookie: the authentication session. It is required for the signed-in screens to work, is not used for advertising, and is not shared with third parties. The public landing page and the map work without it.",
          ],
        },
        {
          heading: "Security",
          paragraphs: [
            "Traffic is encrypted in transit, database access is governed by row-level security so a signed-in user can only read their own rows, gate codes and device secrets are never exposed through a plain table read, and privileged operations are written to an append-only audit log. No system is perfect; if we suffer a breach affecting your data we will tell you and the regulator as the law requires.",
          ],
        },
        {
          heading: "Children",
          paragraphs: [
            "ParkPeer is not for anyone under 18, and we do not knowingly collect their data. If you believe a child has created an account, contact us and we will remove it.",
          ],
        },
        {
          heading: "Contact",
          paragraphs: [
            "Controller: [legal entity name, registered address]. Data protection contact: privacy@parkpeer.example. These placeholders must be replaced with a real entity and a monitored inbox before launch.",
          ],
        },
      ]}
    />
  );
}
