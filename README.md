# Event Frame

Build a premium, production-ready web application called Misantio Photo Order Manager for high-volume event photography workflows such as schools, graduations, conventions, corporate events, class portraits, and organized group photo sessions.

The app must feel like a modern photography studio operations platform, not a generic admin dashboard. Prioritize speed, visual clarity, mobile/iPad usability, premium design, and low-friction workflows during live events.

BRAND & VISUAL DIRECTION

Create an elegant photography-studio aesthetic.

Design direction:

premium minimal

modern editorial photography feel

warm ivory / cream background

deep forest green / charcoal primary colors

subtle muted gold accent

soft rounded cards

refined typography

generous whitespace

subtle shadows

polished micro-interactions

professional, calm, clean, not overly decorative

avoid generic SaaS blue

avoid clutter

do not make it look childish or overly playful

Use responsive layouts that work extremely well on:

desktop

laptop

iPad landscape

iPad portrait

mobile phone

Create a compact bottom navigation on mobile.

Support optional dark mode, especially for Shooting Mode.

CORE APP STRUCTURE

Create these main modules:

Dashboard

Events

Participants

Photo Intake

Shooting Mode

Client Galleries

Orders

Payments

Print Queue

Production / Quality Control

Framing

Delivery Manager

Packages & Pricing

Reports

Settings

1. DASHBOARD

Create a beautiful visual operations dashboard.

Show:

total participants

total orders

total sales

total collected

outstanding balances

participants not yet photographed

galleries ready

pending orders

pending prints

printed

waiting for QC

waiting for framing

ready for pickup/delivery

delivered

Add a visual pipeline:

Registered → Photographed → Gallery Ready → Ordered → Paid → Printed → QC Passed → Framed → Ready → Delivered

Each stage should show:

count

percentage

progress bar

Add:

recent orders

latest payments

production alerts

orders with remaining balance

overdue production items

quick actions

Quick actions:

Add Participant

Upload Photos

Shooting Mode

View Print Queue

Delivery Mode

Create Event

2. EVENTS

Allow multiple events.

Each event should have:

event name

event type

date

venue

description

event status

ordering deadline

delivery date

packages

payment instructions

event branding

public gallery link

QR code

Example event:
School for Congregation Elders 2026

Allow duplicate event / clone event setup.

3. PARTICIPANT MANAGEMENT

Participant fields:

unique participant ID

full name

congregation / organization / class

batch

contact number

optional email

notes

profile thumbnail

shooting status

gallery status

order status

payment status

production status

delivery status

Generate IDs like:
SCE-001
SCE-002
SCE-003

Add:

search

filters

bulk import CSV / Excel

bulk edit

duplicate detection

participant profile page

Participant profile should show the entire history:
Registration
Photos
Selected images
Orders
Payments
Production
Delivery

4. NAMEPLATE + QR WORKFLOW

Create a printable nameplate generator.

Each participant gets:

full name

participant ID

QR code

Allow:

print individual nameplates

print multiple nameplates on Letter/A4

preview before printing

The QR should link to the participant record.

The preferred photo sorting method is participant ID / QR-based tagging rather than face recognition.

Design the workflow so the photographer can shoot a participant holding the nameplate first, then continue shooting portraits.

5. PHOTO INTAKE

Create a powerful bulk photo upload interface.

Support:

drag and drop

multiple files

upload progress

thumbnail grid

batch selection

assign selected images to participant

filter unassigned images

mark favorites

remove incorrect assignment

bulk move

photo count per participant

Create a workflow for:
Unassigned → Assigned → Gallery Ready

Show participant thumbnails to make visual verification easy.

Provide an optional "separator image" workflow:
If a photo containing the participant nameplate / QR is detected or manually marked, all following images can be assigned to that participant until the next separator.

Do NOT depend entirely on facial recognition.

6. SHOOTING MODE

Create a fullscreen, extremely simple Shooting Mode optimized for phone and iPad.

Show:

participant ID

very large participant name

congregation / organization

package if already ordered

payment status

optional participant thumbnail

progress count

next participant preview

Large buttons:

SHOT / DONE

SKIP

NO SHOW

RETAKE

NOTES

Add keyboard shortcuts on desktop.

Support:

queue reorder

search participant

scan QR

mark participant completed

Use a dark premium theme in Shooting Mode to reduce glare.

7. CLIENT GALLERY

Create a public client-facing gallery.

Clients receive a link or QR.

Flow:

Open event link → Search name → Select participant → Verify participant → Open personal gallery

The personal gallery should show only that participant's photos.

Gallery features:

elegant photography layout

large thumbnails

full-screen viewer

favorite/selection button

photo number

select one or multiple images depending on package

clear selected-state indicator

Do not expose admin controls.

Allow optional PIN or participant ID verification.

8. ORDERING EXPERIENCE

Make the ordering flow visually impressive.

After selecting photos, show packages as premium cards.

Each package should have:

package name

included print size

framed / unframed

number of prints

digital copy inclusion

price

description

Create a live visual product mockup using the selected participant photo.

Examples:

4R print mockup

5R print mockup

8R print mockup

framed portrait mockup

multi-photo package mockup

When the client changes package, the mockup should update.

Show:
Selected Photo
Package
Quantity
Price
Subtotal
Balance / amount due

Add optional add-ons:

extra print

extra frame

additional digital file

duplicate print

upgrade print size

9. PAYMENTS

Support:

GCash

Maya

Cash

Payment statuses:
Unpaid
Partial
Paid
Refunded

Fields:

order amount

amount paid

balance

payment method

payment reference

payment date

notes

For GCash/Maya:
show payment instructions and QR image placeholder.

Allow upload of payment screenshot / proof of payment.

Admin can:

verify payment

reject payment proof

mark paid manually

enter partial payment

Show payment activity history.

10. ORDER MANAGEMENT

Order statuses:
Draft
Submitted
Payment Pending
Confirmed
For Print
Printed
QC Check
For Framing
Framed
Final Check
Ready for Delivery
Delivered
Cancelled

Each order must have:

order number

participant

selected photo(s)

package

add-ons

total

paid

balance

payment method

status

timestamps

Create an order detail drawer/page.

11. PRINT QUEUE

Create a dedicated production-friendly print queue.

Group orders by:

print size

package

event

production status

Show:

participant thumbnail

participant name

photo selected

size

quantity

frame requirement

order number

payment status

Include large checkboxes / buttons for:

sent to printer

printed

reprint needed

Allow filters:

4R

5R

8R

framed

unframed

pending

paid only

Create a printable production worksheet.

12. QUALITY CONTROL SYSTEM

Create a strict QC checklist.

Production stages:

For Print

Printed

Print QC

Framed

Frame QC

Final Checked

Ready for Delivery

For every stage store:

completed yes/no

checked by

timestamp

optional notes

Print QC checklist:

correct participant

correct selected image

correct size

correct quantity

correct crop

no visible print defects

correct orientation

Frame QC checklist:

correct frame size

glass/acrylic clean

photo aligned

frame undamaged

backing secure

Final QC:

correct order

complete package

payment status checked

packaging complete

If a QC fails:

mark Reprint Required

add reason

return item to Print Queue

Show a clear production timeline.

13. FRAMING MANAGEMENT

Create a separate framing queue.

Show:

participant image

frame size

frame type

quantity

printing status

Actions:

Frame Started

Framed

QC Passed

Damage / Replace

14. DELIVERY MANAGER

Create a mobile-friendly Delivery Mode.

This is very important.

Show:

participant profile photo

large participant name

congregation / organization

order number

selected photo

package

payment status

remaining balance

production status

Large action buttons:

Collect Balance

Mark Paid

Delivered

Not Claimed

Reschedule / Hold

Delivery should only be allowed when production has passed Final QC, unless admin overrides.

On delivery:
store

delivered timestamp

delivered by

optional receiver name

notes

Make this screen extremely fast to use while standing at a delivery table.

15. PACKAGES & PRICING

Admin can create packages.

Fields:

package name

price

print size

quantity

framed yes/no

digital copy yes/no

description

available add-ons

active/inactive

Add drag-and-drop package ordering.

16. REPORTS

Create reports for:

orders by package

sales

total collected

outstanding balances

print quantities by size

frames needed by size

unclaimed orders

unpaid orders

production status

delivered orders

Add export:

CSV

Excel-compatible CSV

printable PDF-friendly view

Important report:
"Print Requirement Summary"

Example:
4R — 32 prints
5R — 47 prints
8R — 19 prints
5R Frames — 28
8R Frames — 14

Also create a detailed Print Manifest.

17. SEARCH & COMMAND BAR

Create a global search.

Search:

participant

participant ID

order ID

congregation

payment reference

Allow QR scanning when device camera is available.

18. NOTIFICATIONS / ALERTS

Admin alerts:

unpaid order

balance remaining

payment proof awaiting verification

print pending

QC failed

frame pending

ready for delivery

unclaimed order

Optional future support:
SMS / email notification placeholder.

19. AUDIT HISTORY

Every important change should have history:

payment edited

print completed

QC passed

frame completed

delivery completed

Show:
action
user
timestamp
notes

20. DATA / BACKEND

Use Supabase.

Create proper normalized tables such as:

events

participants

photos

participant_photos

packages

orders

order_items

payments

production_checks

deliveries

audit_logs

Use Supabase Storage for uploaded photos.

Use authentication for admin.

Client gallery access should not require admin login.

Use Row Level Security where appropriate.

21. ADMIN ROLES

Prepare for roles:

Owner

Photographer

Cashier

Production

Delivery Staff

Owner has full access.

Photographer:
participant + shooting + photos

Cashier:
orders + payments

Production:
print + QC + framing

Delivery:
delivery page only

22. UX DETAILS

Important:

autosave admin changes

confirmation only for destructive actions

toast notifications

skeleton loading

empty states

clear status colors

no excessive modals

use side drawers where useful

sticky action bars on mobile

large tap targets

fast search

keyboard-friendly desktop UX

Keep statuses visually consistent across the whole app.

23. DEMO DATA

Seed the app with realistic demo data for:
School for Congregation Elders 2026

Use around:

20 participants

multiple congregations

several packages

mixed payment statuses

mixed production statuses

several ready/delivered orders

Use fictional names only.

24. CLIENT EXPERIENCE

The client-facing pages should be much simpler and more elegant than the admin.

Client UI:

Event landing page

Search your name

Personal gallery

Select photo

Choose package

Live product mockup

Payment

Order confirmation

Track order status

Order tracking should display:

Order Received
Payment Confirmed
Printing
Framing
Quality Check
Ready
Delivered

25. FINAL DESIGN GOAL

The final result should feel like a custom professional photography operations platform built for Misantio Studio.

It should feel premium enough to sell later as a product to other photographers and studios.

Do not stop at wireframes.

Build polished working screens and realistic interactions.

Use clean reusable components and keep the interface extremely intuitive under event pressure.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://studio-flow-30.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e27d6369-43fc-4185-a29f-f40b886a0db0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

<!-- lovable-sync: packages-v2-2026-09-18 -->

<!-- lovable-sync-after-reconnect: 2026-09-18-packages-v2 -->
