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

## Agenda stage: Agenda Builder

### 1. Database
In Supabase, open **SQL Editor → New query**, paste all of `supabase/agendas.sql`, and click **Run**.

### 2. Google bridge (lets the app make Docs and send email as you)
1. Make a secret at https://generate-secret.vercel.app/32 and keep it handy.
2. Go to script.google.com → **New project** and name it `Exec Secretary Bridge`.
3. Replace the code with `google-bridge/Bridge.gs`, then paste your secret between the quotes on the `SECRET` line. Save.
4. Choose **authorize** in the function menu, click **Run**, and allow access. (Choose **Advanced → Go to Exec Secretary Bridge** if Google warns you.)
5. Go to **Deploy → New deployment**. Click the gear icon and choose **Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then click **Deploy**.
6. Copy the **Web app URL** (it ends in `/exec`).

### 3. Vercel
Add two environment variables:
- `BRIDGE_URL`: the Web app URL
- `BRIDGE_SECRET`: the same secret

### 4. GitHub
In the repo, go to **Add file → Upload files**, drag in everything inside the updated folder, and click **Commit changes**. Vercel redeploys on its own.

### 5. Try it
- In the app, open **Settings → Agendas** and tap **Test Google connection**. It should show both Agendas folders and the newest agenda in each.
- Add attendee emails in **Settings → Meeting attendees**.
- Open the **Agendas** tab, check the picks, and tap **Create**. Open the Doc to check it, then tap **Email link**.

### Updating the bridge later
In Apps Script, go to **Deploy → Manage deployments**, click the pencil icon, choose **New version**, and click **Deploy**. The URL stays the same.

## Meeting Mode + skip a Sunday
1. **Database:** In Supabase's SQL Editor, run all of `supabase/meeting-mode.sql`.
2. **Bridge:** Open your Apps Script project and copy your `const SECRET = …` line. Replace the code with the new `google-bridge/Bridge.gs`, paste your SECRET line back, and save. Then go to **Deploy → Manage deployments → ✏️ → New version → Deploy**.
3. **GitHub:** Go to **Add file → Upload files**, drag in everything inside the updated folder, and click **Commit changes**.

## Interviews
1. **Database:** In Supabase's SQL Editor, run all of `supabase/interviews.sql`.
2. **Bridge:**
   - Copy your `const SECRET = …` line.
   - Replace the code with the new `google-bridge/Bridge.gs`, paste your SECRET line back, and save.
   - Choose **authorize** and click **Run**. Google asks again because the app now uses Calendar. Allow it.
   - Go to **Deploy → Manage deployments → ✏️ → New version → Deploy**.
3. **Vercel:** Add `CRON_SECRET` (any long random string) for the Monday backup to Drive.
4. **GitHub:** Go to **Add file → Upload files**, drag in everything inside the updated folder, and click **Commit changes**.
5. **In the app:**
   - In **Settings → Interviewers and hours**, choose each person's Google Calendar, check their times, and tap **Save**.
   - In **Settings → My reminders**, tap **Turn on phone reminders**.
   - In **Settings → Data**, tap **Back up to Drive now** to test the backup.

## Import from LCR + youth phones
1. **Database:** In Supabase's SQL Editor, run all of `supabase/import.sql`.
2. **GitHub:** Go to **Add file → Upload files**, drag in everything inside the updated folder, and click **Commit changes**. The bridge doesn't change this time.
3. **In the app:**
   - Go to **Members → Import from LCR lists**.
   - Paste the household list and the member list, then tap **Read lists**.
   - Check the preview and tap **Import**.
