"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, createClient, labels, statusLabel, transitions } from "@grievancegrid/api-client";
import type { Auth, Category, Client, Config, Detail, Page, Status } from "@grievancegrid/api-client";

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const date = (value: string) => new Date(value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`).toLocaleString();

function Photograph({client, tracking, id}: {client: Client; tracking: string; id: string}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    client.evidence(tracking, id).then(blob => {
      if (!cancelled) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [client, tracking, id]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Citizen-submitted complaint evidence" /></a>
    : <p>{failed ? "Photograph unavailable. Refresh to retry." : "Loading photograph…"}</p>;
}

export default function Home() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState<Page>({items: [], total: 0, offset: 0, limit: 25});
  const [selected, setSelected] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<Status | "">("");
  const [requestId, setRequestId] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [source, setSource] = useState<"manual" | "device">("manual");
  const [status, setStatus] = useState<Status>("under_review");
  const client = useMemo(() => createClient(baseUrl, auth?.access_token), [auth]);
  const isCitizen = auth?.user.role === "citizen";
  const isGro = auth?.user.role === "gro";

  const handleError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Something went wrong. Please retry.");
    if (e instanceof ApiError && e.status === 401) { setAuth(null); setSelected(null); }
  }, []);
  const load = useCallback(async (offset = 0) => {
    setPage(await client.list(offset, filter || undefined));
  }, [client, filter]);
  useEffect(() => { client.config().then(setConfig).catch(handleError); }, [client, handleError]);
  useEffect(() => {
    if (auth && (isCitizen || isGro)) load().catch(handleError);
  }, [auth, isCitizen, isGro, load, handleError]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) { handleError(e); } finally { setBusy(false); }
  }
  async function open(tracking: string) {
    const result = await client.get(tracking.trim());
    setSelected(result); setStatus(transitions[result.status][0]);
  }
  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(async () => {
      const email = String(data.get("email")); const password = String(data.get("password"));
      if (register) await client.register(String(data.get("name")), email, password);
      setAuth(await client.login(email, password)); setRegister(false); setSelected(null);
    });
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(async () => {
      const retryId = requestId || crypto.randomUUID(); setRequestId(retryId);
      const result = await client.submit({
        client_request_id: retryId, title: String(data.get("title")),
        description: String(data.get("description")), category: String(data.get("category")) as Category,
        latitude: Number(latitude), longitude: Number(longitude),
        location_text: String(data.get("location_text")), location_source: source,
        image_note: String(data.get("image_note") || "") || null,
      });
      setRequestId(""); setSelected(result); setStatus("under_review");
      const photo = data.get("photo");
      form.reset(); setLatitude(""); setLongitude(""); setSource("manual");
      setNotice(`Complaint saved. Tracking ID: ${result.tracking_id}.`);
      await load();
      if (photo instanceof File && photo.size) {
        try {
          const upload = new FormData(); upload.append("file", photo);
          await client.upload(result.tracking_id, upload); await open(result.tracking_id);
        } catch (e) {
          setError(`Complaint ${result.tracking_id} is saved, but its photograph was not uploaded. Use “Add photograph” below to retry. ${e instanceof Error ? e.message : ""}`);
        }
      }
    });
  }
  function locate() {
    if (!navigator.geolocation) { setError("Location is unavailable. Enter coordinates manually."); return; }
    setNotice("Requesting your location…");
    navigator.geolocation.getCurrentPosition(position => {
      setLatitude(position.coords.latitude.toFixed(6)); setLongitude(position.coords.longitude.toFixed(6));
      setSource("device"); setNotice("Location added. Check it describes the problem, not just your current position.");
    }, () => { setNotice(""); setError("Location permission or fix unavailable. Enter coordinates manually."); }, {timeout: 15000});
  }

  return <>
    <header><div className="shell topbar"><a className="brand" href="/">GrievanceGrid</a><span>Mobile + web · working prototype</span></div></header>
    <main className="shell">
      <div className="intro"><p className="eyebrow">{config?.jurisdiction_name || "Demo municipality (simulated)"}</p>
        <h1>{auth ? isGro ? "Complaint review desk" : "Your civic complaints" : "Report a problem. Follow its progress."}</h1>
        <p>Four visible civic categories. Individual tracking. Officer-reviewed updates.</p>
      </div>
      <aside className="disclaimer">Academic prototype—not an official government or emergency service. AI analysis is disabled in this milestone. Photograph issues only when it is safe.</aside>
      {error && <div role="alert" className="message error">{error}</div>}
      {notice && <div role="status" className="message">{notice}</div>}
      {!auth ? <section className="panel auth-panel">
        <h2>{register ? "Create a citizen account" : "Sign in"}</h2>
        <p className="muted">Officer accounts are provisioned separately. Sessions stay in memory; reloading signs this browser out.</p>
        <form onSubmit={signIn}>
          {register && <label>Your name<input name="name" required minLength={2} maxLength={120} autoComplete="name" /></label>}
          <label>Email<input name="email" type="email" required autoComplete="email" /></label>
          <label>Password<input name="password" type="password" required minLength={register ? 12 : 1} maxLength={128} autoComplete={register ? "new-password" : "current-password"} /></label>
          {register && <small>Use at least 12 characters. Do not reuse a password from another service.</small>}
          <button disabled={busy}>{busy ? "Please wait…" : register ? "Create account and sign in" : "Sign in"}</button>
        </form>
        <button className="secondary" disabled={busy} onClick={() => {setRegister(!register); setError("");}}>{register ? "Already registered? Sign in" : "New citizen? Create account"}</button>
      </section> : <>
        <div className="account"><span>{auth.user.name} · {auth.user.role.toUpperCase()}</span>
          <button className="secondary" disabled={busy} onClick={() => run(async () => {await client.logout(); setAuth(null); setSelected(null); setPage({items: [], total: 0, offset: 0, limit: 25});})}>Sign out</button></div>
        {(!isCitizen && !isGro) && <p>This role&apos;s assignment tools are planned for the next milestone. Complaint review is reserved for GRO accounts.</p>}
        <div className="columns">
          <div>
            {isCitizen && <section className="panel"><h2>Submit a complaint</h2>
              <p className="muted">Unsupported complaint types are outside this pilot. No photograph? Explain below and an officer can review it.</p>
              <form onSubmit={submit} onChange={() => setRequestId("")}>
                <label>Category<select name="category" required>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                <label>Title<input name="title" required minLength={5} maxLength={160} /></label>
                <label>Describe the problem<textarea name="description" required minLength={20} maxLength={5000} rows={4} /></label>
                <label>Location / landmark<input name="location_text" required minLength={5} maxLength={240} /></label>
                <div className="row"><label>Latitude<input name="latitude" type="number" step="any" min={-90} max={90} required value={latitude} onChange={e => {setLatitude(e.target.value); setSource("manual");}} /></label>
                  <label>Longitude<input name="longitude" type="number" step="any" min={-180} max={180} required value={longitude} onChange={e => {setLongitude(e.target.value); setSource("manual");}} /></label></div>
                <button type="button" className="secondary" disabled={busy} onClick={locate}>Use current location</button>
                <small>A map picker is planned; for now enter the problem&apos;s coordinates or use device location.</small>
                <label>Photograph (optional, JPEG/PNG, up to 8 MiB)<input name="photo" type="file" accept="image/jpeg,image/png" /></label>
                <label>Evidence note (optional)<input name="image_note" maxLength={500} placeholder="For example: unsafe to approach the opening" /></label>
                <button disabled={busy}>{busy ? "Saving…" : "Submit complaint"}</button>
              </form>
            </section>}
            {(isCitizen || isGro) && <section className="panel"><div className="section-title"><h2>{isGro ? "Jurisdiction queue" : "Your reports"}</h2><button className="secondary" disabled={busy} onClick={() => run(() => load())}>Refresh list</button></div>
              <label>Filter by status<select value={filter} onChange={e => setFilter(e.target.value as Status | "")}><option value="">All statuses</option>{Object.keys(transitions).map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
              <p className="muted">{page.total} complaint{page.total === 1 ? "" : "s"}. Latest received first—not AI ranked.</p>
              {!page.items.length && <p>No complaints in this view.</p>}
              <ul className="reports">{page.items.map(item => <li key={item.id}><button className="report" disabled={busy} onClick={() => run(() => open(item.tracking_id))}><strong>{item.title}</strong><span>{item.tracking_id}</span><span className="badge">{statusLabel(item.status)}</span></button></li>)}</ul>
              <div className="row"><button className="secondary" disabled={busy || page.offset === 0} onClick={() => run(() => load(Math.max(0, page.offset - page.limit)))}>Previous</button><button className="secondary" disabled={busy || page.offset + page.limit >= page.total} onClick={() => run(() => load(page.offset + page.limit))}>Next</button></div>
            </section>}
          </div>
          <section className="panel detail"><h2>Tracking and updates</h2>
            <form className="lookup" onSubmit={e => {e.preventDefault(); const data = new FormData(e.currentTarget); run(() => open(String(data.get("tracking"))));}}>
              <label>Tracking ID<input name="tracking" required placeholder="GG-2026-…" /></label><button disabled={busy}>Look up</button>
            </form>
            <p className="muted">Access is checked on the server. Citizens can open only their own records.</p>
            {selected ? <article key={selected.id}>
              <div className="section-title"><h3>{selected.title}</h3><span className="badge">{statusLabel(selected.status)}</span></div>
              <p className="tracking">{selected.tracking_id}</p>
              <p className="prewrap">{selected.description}</p>
              <dl><dt>Category</dt><dd>{labels[selected.category]}</dd><dt>Location</dt><dd>{selected.location_text}<br />{selected.latitude}, {selected.longitude} ({selected.location_source})</dd><dt>Received</dt><dd>{date(selected.received_at)}</dd><dt>Analysis</dt><dd>Disabled · manual officer review</dd></dl>
              {selected.image_note && <p>Evidence note: {selected.image_note}</p>}
              <h3>Photographs</h3>
              <p className="muted">Private, processed copies; EXIF metadata is removed. No authenticity verdict is made.</p>
              <div className="photos">{selected.evidence.map(file => <Photograph client={client} tracking={selected.tracking_id} id={file.id} key={file.id} />)}</div>
              {!selected.evidence.length && <p>No photographs attached.</p>}
              {isCitizen && selected.evidence.length < 5 && <form onSubmit={e => {e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); run(async () => {await client.upload(selected.tracking_id, data); await open(selected.tracking_id); form.reset(); setNotice("Photograph added.");});}}><label>Add photograph<input name="file" type="file" required accept="image/jpeg,image/png" /></label><button className="secondary" disabled={busy}>Upload photograph</button></form>}
              <h3>Status history</h3><ol className="timeline">{selected.events.map(event => <li key={event.id}><strong>{statusLabel(event.status)}</strong><small>{date(event.created_at)}</small><p className="prewrap">{event.note}</p></li>)}</ol>
              {isCitizen && <button className="secondary" disabled={busy} onClick={() => run(() => open(selected.tracking_id))}>Refresh record</button>}
              {isGro && <form className="review" onSubmit={e => {e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); run(async () => {const updated = await client.update(selected.tracking_id, status, String(data.get("note")), selected.version); setSelected(updated); setStatus(transitions[updated.status][0]); await load(page.offset); form.reset(); setNotice("Officer update saved.");});}}>
                <h3>Record an officer update</h3><p className="muted">All notes here are visible to the citizen. State the action taken and reason. Resolving a report is a human decision.</p>
                <label>Next status<select value={status} onChange={e => setStatus(e.target.value as Status)}>{transitions[selected.status].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
                <label>Reason / update<textarea name="note" required minLength={10} maxLength={2000} rows={4} /></label>
                <button disabled={busy}>Save officer update</button><button type="button" className="secondary" disabled={busy} onClick={() => run(() => open(selected.tracking_id))}>Refresh record</button>
              </form>}
            </article> : <p className="empty">Select a report or enter a tracking ID to view its history.</p>}
          </section>
        </div>
      </>}
      <footer>GrievanceGrid · Four-category municipal pilot · No live government integration</footer>
    </main>
  </>;
}
