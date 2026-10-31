# Plani i Veprimit: Zgjidhja e Gabimit 403 Forbidden & Publikimi i ReneeTV Live

## Përmbledhje e Problemit dhe Shkaku
Kur tentoni të hapni linket e brendshme të Google AI Studio / Cloud Run (`ais-dev-...` ose `ais-pre-...`), shfletuesi shfaq gabimin **"403 Forbidden / Access Denied"**.

### Pse ndodh ky gabim?
1. **Mbrojtja IAM e Google Cloud**: Këto linka janë ambiente të brendshme zhvillimi (dev preview). Ato kërkojnë që shfletuesi të ketë sesion të autorizuar të llogarisë Google (`gashi.sc24@gmail.com`) me cookies aktive të palës së tretë.
2. **Kufizimi i Sesioneve**: Nëse shfletuesi ka disa llogari Google të hapura njëkohësisht (ose bllokon cookies), Google Cloud Run refuzon kërkesën me kodin `403 Forbidden`.
3. **Pajisjet e Jashtme (TV, Telefon)**: Këto linka të brendshme nuk mund të hapen kurrë në pajisje të tjera (si Smart TV apo telefona pa autorizim IAM) sepse nuk janë faqe publike të internetit.

---

## Zgjidhja në 2 Faza

### Faza 1: Shikimi i Menjëhershëm në Kompjuter (Pa Gabim 403)
Për të parë aplikacionin ReneeTV Live tani në kompjuterin tuaj:
- **Paneli i Drejtpërdrejtë në AI Studio**: Aplikacioni funksionon 100% brenda dritares së djathtë të AI Studio (Preview Panel). Aty serveri punon lokalisht dhe të gjitha kanalet ngarkohen pa bllokim IAM.
- **Rregullimi i llogarisë për tab të ri**: Nëse doni ta hapni në një tab të ri, sigurohuni që llogaria kryesore aktive në atë profil të jetë saktësisht `gashi.sc24@gmail.com` dhe cookies të mos jenë të bllokuara.

---

### Faza 2: Publikimi Publik (Për Kompjuter, Telefon & Smart TV pa asnjë kufizim)
Që linku të funksionojë për këdo, pa kërkuar llogari Google, pa bllokime 403, dhe të mund të hapet direkt në:
- **Kompjuter** (çdo browser)
- **Telefon** (iOS / Android)
- **Smart TV** (Browser i televizorit)

Ne do të konfigurojmë skedarët e projektit për publikim të menjëhershëm në **Vercel** ose shërbim të ngjashëm publik (pa pagesë):

1. **Skedari i Konfigurimit Vercel (`vercel.json`)**:
   - Shtimi i rregullave të rrugëzimit (rewrites) për SPA dhe CORS header për transmetimet HLS.
   - Sigurimi që të gjitha rrugët (`/`, `/favorites`, etj.) të shërbehen pa gabime 404/403.

2. **Optimizimi i Paketimit (`vite.config.ts` & `package.json`)**:
   - Verifikimi i `base: './'` dhe build-it statik që funksionon në çdo server publik.
   - Përgatitja e komandave të pastra të build-it (`npm run build`).

3. **Udhëzuesi i thjeshtë me 3 hapa për aktivizimin e linkut tuaj të përhershëm**:
   - Lidhja me GitHub ose ngarkimi i drejtpërdrejtë me Vercel CLI / Vercel Web.
   - Do të keni linkun tuaj unik (p.sh. `https://reneetv-live.vercel.app`) i cili:
     - Nuk kërkon asnjëherë login Google.
     - Nuk jep kurrë 403 Forbidden.
     - Hap të gjitha kanalet në të gjitha pajisjet.

---

## Hapat e Ardhshëm
Sapo të konfirmoni këtë plan:
1. Do të krijojmë skedarin `vercel.json` dhe do të përshtatim konfigurimin e projektit për gatishmëri 100% publike.
2. Do të verifikojmë build-in e prodhimit.
3. Do t'ju paraqesim mënyrën më të shpejtë për të marrë linkun publik që punon kudo.
