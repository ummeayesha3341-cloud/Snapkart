# Receipt gate and item reconciliation

## What the receipt QR does

SnapKart's QR contains a high-entropy receipt URL. It lets the staff gate look up the server-side order and payment state. It is a receipt authenticity and transaction lookup mechanism; it does not observe what is physically in a basket and cannot reveal an item that was never scanned.

## Current staff/gate flow

1. A customer presents the receipt QR at the exit.
2. An owner grants gate access to an existing, verified SnapKart account. Admin role and staff access are separate; admin gate access still requires MFA.
3. Staff scans the QR with the gate screen (or enters its link), then compares every physical item and quantity with the receipt list.
4. The backend allows a clear only when the order is paid and payment is settled. A receipt can be cleared once. Staff can record a mismatch with a note; unpaid, duplicate, flagged and denied checks are retained in the audit history for the owner.

This is a staffed visual check, not automated merchandise detection. Train staff to pause the exit and ask a supervisor when the basket does not match.

Simulated payments are blocked from gate clearance in production. A local demo can opt in by setting `ALLOW_SIMULATED_GATE_PAYMENTS=true` while `NODE_ENV` is not `production`; never enable that flag for a real store.

## Alternatives

| Option | What it can establish | Requirements and limits | SnapKart fit |
|---|---|---|---|
| Manual staff comparison (current) | A person compares each visible item and quantity to the paid order. | Staff time and consistent procedure; may miss concealed items or human mistakes. | Best first pilot because it uses the current receipt and requires no store hardware. Measure review time and mismatch rate. |
| EAS labels/gate | Detects an active security label passing through an EAS field and can alarm. | Every protected item must be tagged and tags must be correctly deactivated/handled. Conventional EAS does not identify the SKU or reconcile basket contents to a specific receipt. | A deterrence layer for tagged merchandise, not an item reconciliation system. Do not treat “no alarm” as proof that all items were scanned. |
| Item-level RFID | Reads unique EPC/SGTIN identities on tagged items; a gate reader can compare observed items with the order's item identities. | Requires item-level tags and stable identity-to-order mapping, source tagging or store tagging, portal readers/antennas, RF tuning, and testing for missed/stray reads. A normal UPC/EAN barcode identifies a product type, not an individual unit. | Strongest automated reconciliation candidate if suppliers can provide compatible serialized tags for most merchandise. Pilot a small tagged category and compare reads against staff-confirmed baskets before deployment. |
| Vision-assisted reconciliation | Cameras and a trained recognition system can estimate which products cross a checkout/exit area and compare them with scanned items. | Needs representative product images/video, multiple-camera or item-presentation design, reliable shopper-to-basket association, and a human path for low-confidence cases. Occlusion, visually similar packaging, changing assortments, lighting, and privacy retention are key constraints. | Research-stage option for SnapKart. Consider a fixed, controlled scan/bagging station with staff review before any store-wide exit monitoring. Do not use face recognition. |

## Recommendation

Start with the staff comparison workflow and collect a baseline: number of checks, review seconds per order, mismatches, false alarms, and reasons. If loss prevention needs remain and merchandise can be item-tagged, run a controlled RFID pilot. RFID can compare unique tagged items with a receipt; EAS alarms alone cannot. Evaluate vision only after defining a narrow station, privacy boundary, and measured acceptance threshold. Avoid buying gate hardware until a pilot shows the frequency of missed scans and the cost of false alarms.

The RFID distinction follows GS1's guidance that EPC/SGTIN supports item-level identity and GS1's RFID-based EAS implementation guide, which describes reader-to-sale and point-of-exit coordination. Vision-based checkout has been demonstrated in research prototypes, including a smart trolley item-verification study, but those prototypes do not establish accuracy for SnapKart's catalog or store layout.

## Sources

- [GS1 RFID-based EAS Technical Implementation Guideline](https://www.gs1.org/sites/default/files/docs/epc/EAS_Tech_ImplementationGuide_v_1_approved.pdf)
- [GS1 System Architecture: RFID and retail inventory examples](https://ref.gs1.org/architecture/system-architecture/)
- [Item Verification on the Smart Trolley System using Object Recognition](https://doi.org/10.1016/j.procs.2023.10.512)
