
# Restructure: Profile vs Team

You're right — it's backwards. Here's the fix.

## New Profile page (`/profile`)
Just the signed-in **user account**. No driver stuff.
- Display name
- Email (with "change email")
- Password (change password)
- Notification preferences (email / push / SMS)
- Delete account

That's it. Applies equally to an owner-operator, a fleet owner, a dispatcher, or a driver — it's their login.

## New Company & Team page (`/company`)
Keep the existing Company tab (company info, billing, plan). Rework the **Team** tab into a directory:

**Team tab layout**
- Filter bar: role dropdown (All · Fleet Owner · Fleet Manager · Dispatcher · Safety · Maintenance · Accountant · Driver) + search by name
- List of members showing: name, role badges, assigned truck (if driver), active/inactive
- Click a row → expands (or opens a side panel) with that person's full detail:
  - **Everyone:** first/last name, phone, employee ID, username, roles, permission overrides, active toggle, force-password-change
  - **Drivers only (conditional):** Driver ID number, assigned truck/trailer, ELD system, **driver pay setup** (model + rate), **truck profile** (dimensions, weight, hazmat), **truck registration** (plate, VIN, expiry), **favorite locations**, **saved routes**, **voice settings**

So a dispatcher's expanded card is short; a driver's card has all the rig/pay/route stuff that used to sit on `/profile`.

## What moves where

| Card | From | To |
|---|---|---|
| Driver name / pay model / pay rate | `/profile` | `/company` → Team → member detail (drivers only) |
| Truck Profile | `/profile` | `/company` → Team → member detail (drivers only) |
| Truck Registration | `/profile` | `/company` → Team → member detail (drivers only) |
| Favorite Locations | `/profile` | `/company` → Team → member detail (drivers only) |
| Saved Routes | `/profile` | `/company` → Team → member detail (drivers only) |
| Voice Settings | `/profile` | `/company` → Team → member detail (drivers only) |
| Notification prefs | `/profile` | stays on `/profile` |
| Delete account | `/profile` | stays on `/profile` |

## Permissions
- Anyone can view/edit **their own** detail panel in Team (so a driver can still update their truck profile, favorites, etc.).
- Members with `members.manage` can view/edit **anyone's** panel.
- Admin-only fields (roles, permission overrides, active toggle, force password change, employee ID) stay gated to `members.manage` — same as today.

## Mobile nav
Bottom-bar "Me" stays pointing at `/profile` (account). Drivers reach their truck/pay/routes via Company & Team → tap their own name.

## Files touched
- `src/routes/_authenticated/profile.tsx` — strip down to account + notifications + delete
- `src/routes/_authenticated/company.tsx` — Team tab gets filter + expandable member detail
- New `src/components/team-member-detail.tsx` — the expandable panel; reuses existing `TruckProfileCard`, `TruckRegistrationCard`, `FavoriteLocationsCard`, `SavedRoutesCard`, `VoiceSettingsCard`, and a new driver-pay sub-form
- Existing cards stay as-is; they already scope to the signed-in user. For admin-edits-another-user we'd need a `userId` prop — flag if you want that in this pass or "self-edit only for now".

## One decision needed
**Admin editing another driver's truck/pay/routes** — do you want that in this pass, or is it fine if each driver edits their own and admins only manage roles/permissions/status? The first is more work (every card needs a `userId` prop + server-fn changes); the second ships faster and matches how it works today.

Reply with **A** (self-edit only, ship now) or **B** (admins can edit anyone), and I'll build it.
