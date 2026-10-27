# Cienega Exec Secretary

The executive secretary app for the Cienega Ward. It runs on Next.js, hosted on Vercel, with the data in Supabase.

## Stage 1: Home, Members, Settings

### 1. Supabase (database)
1. Go to supabase.com and create a **New project**. Call it `exec-secretary`, set a database password, and choose the West US region.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and click **Run**.
3. Open **Project Settings → API** (or **Data API**) and copy the **Project URL** and the **service_role** secret key.

### 2. GitHub
1. Create a new **private** repository named `exec-secretary`.
2. Click **uploading an existing file**, drag in everything inside this folder (not the folder itself), and click **Commit changes**.

### 3. Vercel
1. Go to **Add New → Project**, import `exec-secretary`, and leave the framework set to Next.js.
2. Under **Environment Variables**, add:
   - `SUPABASE_URL`: the Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: the service_role key
   - `APP_PASSCODE`: the passcode you'll sign in with (use a short phrase, not 4 digits)
   - `SESSION_SECRET`: a long random string. You can get one at https://generate-secret.vercel.app/32
3. Click **Deploy**.

### 4. Your phone
1. Open the Vercel link and sign in with your passcode.
2. Add the app to your home screen:
   - Android (Chrome): open the **⋮** menu and choose **Add to Home screen** or **Install app**.
   - iPhone (Safari): tap **Share** and choose **Add to Home Screen**.

### Updating later
Upload the changed files to GitHub (or push them). Vercel redeploys automatically, and the link and home screen icon stay the same.
