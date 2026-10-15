import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { ApiError, createClient, labels, statusLabel, transitions } from "@grievancegrid/api-client";
import type { Auth, Category, Detail, Page, Status } from "@grievancegrid/api-client";

const baseUrl = process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:8000";
const initialPage: Page = {items: [], total: 0, offset: 0, limit: 25};

function Button({title, onPress, disabled = false, secondary = false}: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[s.button, secondary && s.secondary, disabled && {opacity: .45}]}>
    <Text style={[s.buttonText, secondary && {color: "#18201e"}]}>{title}</Text>
  </Pressable>;
}
function Input({label, value, onChange, multiline = false, secure = false, numeric = false, disabled = false}: {
  label: string; value: string; onChange: (value: string) => void;
  multiline?: boolean; secure?: boolean; numeric?: boolean; disabled?: boolean;
}) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput
    accessibilityLabel={label} style={[s.input, multiline && {minHeight: 95, textAlignVertical: "top"}]}
    value={value} onChangeText={onChange} multiline={multiline} secureTextEntry={secure}
    autoCapitalize="none" autoCorrect={!secure} editable={!disabled}
    keyboardType={numeric ? "numbers-and-punctuation" : "default"}
    maxLength={secure ? 128 : multiline ? 5000 : 500}
  /></View>;
}

async function pickPhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({mediaTypes: ["images"], quality: .8});
  if (result.canceled || !result.assets.length) return null;
  const asset = result.assets[0];
  if (asset.mimeType && !["image/jpeg", "image/png"].includes(asset.mimeType)) {
    throw new Error("Use a JPEG or PNG photograph. HEIC and other formats are not supported yet.");
  }
  if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) throw new Error("Choose a photograph smaller than 8 MiB.");
  return asset;
}

function photoForm(asset: ImagePicker.ImagePickerAsset) {
  const data = new FormData();
  data.append("file", {
    uri: asset.uri, name: asset.fileName || "complaint.jpg", type: asset.mimeType || "image/jpeg",
  } as unknown as Blob);
  return data;
}

export default function App() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [register, setRegister] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [jurisdiction, setJurisdiction] = useState("Demo municipality (simulated)");
  const [page, setPage] = useState<Page>(initialPage);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [tracking, setTracking] = useState("");
  const [category, setCategory] = useState<Category>("road_damage");
  const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [landmark, setLandmark] = useState("");
  const [latitude, setLatitude] = useState(""); const [longitude, setLongitude] = useState("");
  const [locationSource, setLocationSource] = useState<"manual" | "device">("manual");
  const [imageNote, setImageNote] = useState("");
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [nextStatus, setNextStatus] = useState<Status>("under_review");
  const [note, setNote] = useState("");
  const retryId = useRef("");
  const client = useMemo(() => createClient(baseUrl, auth?.access_token), [auth]);
  const isCitizen = auth?.user.role === "citizen";
  const isGro = auth?.user.role === "gro";

  const handleError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Something went wrong. Retry shortly.");
    if (e instanceof ApiError && e.status === 401) {setAuth(null); setSelected(null);}
  }, []);
  const load = useCallback(async (offset = 0) => setPage(await client.list(offset)), [client]);
  useEffect(() => {client.config().then(c => setJurisdiction(c.jurisdiction_name)).catch(handleError);}, [client, handleError]);
  useEffect(() => {if (auth && (isCitizen || isGro)) load().catch(handleError);}, [auth, isCitizen, isGro, load, handleError]);
  useEffect(() => {retryId.current = "";}, [category, title, description, landmark, latitude, longitude, imageNote]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try {await action();} catch (e) {handleError(e);} finally {setBusy(false);}
  }
  async function open(id: string) {
    const result = await client.get(id.trim());
    setSelected(result); setNextStatus(transitions[result.status][0]); setNote("");
    await load(page.offset);
  }
  async function signIn() {
    if (register) await client.register(name, email, password);
    setAuth(await client.login(email, password)); setPassword(""); setRegister(false);
  }
  async function locate() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") throw new Error("Location permission declined. You can enter coordinates manually.");
    let timeout: ReturnType<typeof setTimeout>;
    try {
      const position = await Promise.race([
        Location.getCurrentPositionAsync({accuracy: Location.Accuracy.Balanced}),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error("No location fix yet. Enter coordinates manually or retry outdoors.")), 15000);
        }),
      ]);
      setLatitude(position.coords.latitude.toFixed(6)); setLongitude(position.coords.longitude.toFixed(6));
      setLocationSource("device"); setNotice("Check the location describes the problem, not only where you are now.");
    } finally {clearTimeout(timeout!);}
  }
  async function submit() {
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      throw new Error("Enter the problem's latitude and longitude or use device location.");
    }
    retryId.current ||= Crypto.randomUUID();
    const record = await client.submit({
      client_request_id: retryId.current, title, description, category,
      latitude: Number(latitude), longitude: Number(longitude), location_text: landmark,
      location_source: locationSource, image_note: imageNote || null,
    });
    retryId.current = ""; setSelected(record); setTracking(record.tracking_id);
    setNotice(`Saved. Tracking ID: ${record.tracking_id}`);
    setTitle(""); setDescription(""); setLandmark(""); setLatitude(""); setLongitude("");
    setImageNote(""); setLocationSource("manual");
    const attachment = photo; setPhoto(null);
    await load();
    if (attachment) {
      try {await client.upload(record.tracking_id, photoForm(attachment)); await open(record.tracking_id);}
      catch (e) {setError(`Complaint ${record.tracking_id} is saved. Photograph upload failed; use “Add photograph” on this record to retry. ${e instanceof Error ? e.message : ""}`);}
    }
  }

  return <SafeAreaView style={s.safe}><StatusBar style="dark" />
    <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={s.brand}>GrievanceGrid</Text><Text style={s.muted}>{jurisdiction}</Text>
        <Text style={s.heading}>{auth ? isGro ? "Complaint review" : "Your civic complaints" : "Report. Track. Stay informed."}</Text>
        <Text style={s.disclaimer}>Academic prototype—not a government or emergency service. AI analysis is disabled. Only take photographs when safe.</Text>
        {busy && <ActivityIndicator accessibilityLabel="Working" color="#18201e" />}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
        {!auth ? <View style={s.panel}>
          <Text style={s.subheading}>{register ? "Create citizen account" : "Sign in"}</Text>
          {register && <Input label="Your name" value={name} onChange={setName} disabled={busy} />}
          <Input label="Email" value={email} onChange={setEmail} disabled={busy} />
          <Input label="Password" value={password} onChange={setPassword} secure disabled={busy} />
          <Text style={s.muted}>{register ? "Use 12+ characters. Registration creates citizens only." : "Officer accounts are provisioned separately."}</Text>
          <Button title={register ? "Create account and sign in" : "Sign in"} disabled={busy} onPress={() => run(signIn)} />
          <Button title={register ? "Already registered? Sign in" : "New citizen? Create account"} secondary disabled={busy} onPress={() => {setRegister(!register); setError("");}} />
          <Text style={s.muted}>Sessions stay in memory. Restarting the app requires signing in again.</Text>
        </View> : <>
          <Text>{auth.user.name} · {auth.user.role.toUpperCase()}</Text>
          <Button title="Sign out" secondary disabled={busy} onPress={() => run(async () => {await client.logout(); setAuth(null); setSelected(null); setPage(initialPage);})} />
          {isCitizen && <View style={s.panel}>
            <Text style={s.subheading}>Submit a complaint</Text>
            <Text style={s.label}>Category</Text>
            {Object.entries(labels).map(([id, text]) => <Pressable key={id} disabled={busy} accessibilityRole="radio"
              accessibilityState={{checked: category === id}} onPress={() => setCategory(id as Category)} style={[s.category, category === id && s.chosen]}>
              <Text style={category === id ? {fontWeight: "700"} : {}}>{category === id ? "● " : "○ "}{text}</Text></Pressable>)}
            <Input label="Title (5–160 characters)" value={title} onChange={setTitle} disabled={busy} />
            <Input label="Describe the problem (20+ characters)" value={description} onChange={setDescription} multiline disabled={busy} />
            <Input label="Location / landmark" value={landmark} onChange={setLandmark} disabled={busy} />
            <Input label="Latitude" value={latitude} onChange={v => {setLatitude(v); setLocationSource("manual");}} numeric disabled={busy} />
            <Input label="Longitude" value={longitude} onChange={v => {setLongitude(v); setLocationSource("manual");}} numeric disabled={busy} />
            <Button title="Use current location" secondary disabled={busy} onPress={() => run(locate)} />
            <Text style={s.muted}>A map picker is planned. Confirm these coordinates belong to the reported problem.</Text>
            <Button title={photo ? "Change selected photograph" : "Choose photograph (optional)"} secondary disabled={busy} onPress={() => run(async () => {const chosen = await pickPhoto(); if (chosen) setPhoto(chosen);})} />
            {photo && <><Image source={{uri: photo.uri}} style={s.photo} /><Button title="Remove selected photograph" secondary disabled={busy} onPress={() => setPhoto(null)} /></>}
            <Input label="Evidence note (optional; explain if a photograph is unsafe)" value={imageNote} onChange={setImageNote} disabled={busy} />
            <Button title="Submit complaint" disabled={busy} onPress={() => run(submit)} />
          </View>}
          {(isCitizen || isGro) && <View style={s.panel}>
            <Text style={s.subheading}>{isGro ? "Jurisdiction queue" : "Your reports"}</Text>
            <Text style={s.muted}>{page.total} records · newest first, not AI ranked</Text>
            <Button title="Refresh list" secondary disabled={busy} onPress={() => run(() => load())} />
            {!page.items.length && <Text>No reports in this view.</Text>}
            {page.items.map(item => <Pressable accessibilityRole="button" key={item.id} disabled={busy} onPress={() => run(() => open(item.tracking_id))} style={s.report}>
              <Text style={s.label}>{item.title}</Text><Text>{item.tracking_id}</Text><Text style={s.muted}>{statusLabel(item.status)}</Text></Pressable>)}
            <Button title="Previous reports" secondary disabled={busy || !page.offset} onPress={() => run(() => load(Math.max(0, page.offset - 25)))} />
            <Button title="Next reports" secondary disabled={busy || page.offset + 25 >= page.total} onPress={() => run(() => load(page.offset + 25))} />
          </View>}
          {!isCitizen && !isGro && <Text>This role's assignment tools are planned. GRO accounts handle review in this milestone.</Text>}
          <View style={s.panel}><Text style={s.subheading}>Tracking and updates</Text>
            <Input label="Tracking ID" value={tracking} onChange={setTracking} disabled={busy} />
            <Button title="Look up complaint" disabled={busy || !tracking.trim()} onPress={() => run(() => open(tracking))} />
            {selected && <View style={s.record}>
              <Text style={s.subheading}>{selected.title}</Text><Text selectable>{selected.tracking_id}</Text>
              <Text style={s.status}>{statusLabel(selected.status)}</Text>
              <Text>{selected.description}</Text><Text>{labels[selected.category]}</Text>
              <Text>{selected.location_text} ({selected.latitude}, {selected.longitude})</Text>
              <Text style={s.muted}>AI disabled · manual officer review</Text>
              {!!selected.image_note && <Text>Evidence note: {selected.image_note}</Text>}
              <Text style={s.label}>Photographs</Text>
              {!selected.evidence.length && <Text>No photographs attached.</Text>}
              {selected.evidence.map(file => <Image key={file.id} accessibilityLabel="Complaint photograph" style={s.photo}
                source={{uri: client.evidenceUrl(selected.tracking_id, file.id), headers: {Authorization: `Bearer ${auth.access_token}`}}} />)}
              {isCitizen && selected.evidence.length < 5 && <Button title="Add photograph" secondary disabled={busy} onPress={() => run(async () => {const chosen = await pickPhoto(); if (chosen) {await client.upload(selected.tracking_id, photoForm(chosen)); await open(selected.tracking_id); setNotice("Photograph added.");}})} />}
              <Text style={s.label}>Status history</Text>
              {selected.events.map(event => <View key={event.id} style={s.event}><Text style={s.label}>{statusLabel(event.status)}</Text><Text>{event.note}</Text><Text style={s.muted}>{new Date(event.created_at).toLocaleString()}</Text></View>)}
              {isGro && <>
                <Text style={s.subheading}>Officer update</Text><Text style={s.muted}>Notes are visible to the citizen. Explain the action and reason.</Text>
                {transitions[selected.status].map(value => <Button key={value} title={`${nextStatus === value ? "● " : "○ "}${statusLabel(value)}`} secondary disabled={busy} onPress={() => setNextStatus(value)} />)}
                <Input label="Reason / update (10+ characters)" value={note} onChange={setNote} multiline disabled={busy} />
                <Button title="Save officer update" disabled={busy} onPress={() => run(async () => {const updated = await client.update(selected.tracking_id, nextStatus, note, selected.version); setSelected(updated); setNextStatus(transitions[updated.status][0]); setNote(""); await load(page.offset); setNotice("Officer update saved.");})} />
              </>}
              <Button title="Refresh record" secondary disabled={busy} onPress={() => run(() => open(selected.tracking_id))} />
            </View>}
          </View>
        </>}
        <Text style={s.muted}>GrievanceGrid · Four-category pilot · No live government integration</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: {flex: 1, backgroundColor: "#f5f6f4"}, container: {padding: 22, gap: 15, paddingBottom: 50},
  brand: {fontSize: 25, fontWeight: "700", color: "#18201e", marginTop: 16},
  heading: {fontSize: 29, fontWeight: "600", lineHeight: 35},
  subheading: {fontSize: 21, fontWeight: "600"}, muted: {fontSize: 13, color: "#59625e", lineHeight: 19},
  disclaimer: {backgroundColor: "#e9ede9", padding: 14, lineHeight: 20, fontSize: 13},
  panel: {backgroundColor: "white", padding: 18, borderWidth: 1, borderColor: "#d8ddda", borderRadius: 6, gap: 14},
  field: {gap: 6}, label: {fontSize: 14, fontWeight: "600"},
  input: {borderWidth: 1, borderColor: "#aeb8b2", padding: 12, borderRadius: 4, fontSize: 16, color: "#18201e"},
  button: {backgroundColor: "#18201e", borderRadius: 4, borderWidth: 1, borderColor: "#18201e", padding: 13, alignItems: "center"},
  secondary: {backgroundColor: "white"}, buttonText: {color: "white", fontSize: 14, fontWeight: "600"},
  category: {padding: 12, borderWidth: 1, borderColor: "#d8ddda", borderRadius: 4}, chosen: {backgroundColor: "#e9ede9", borderColor: "#18201e"},
  report: {padding: 13, borderWidth: 1, borderColor: "#d8ddda", borderRadius: 4, gap: 4},
  error: {backgroundColor: "#fff2f2", color: "#852a2a", padding: 14, lineHeight: 21},
  notice: {backgroundColor: "#edf4ee", padding: 14, lineHeight: 21}, record: {gap: 15, marginTop: 15},
  status: {backgroundColor: "#e9ede9", padding: 8, textTransform: "capitalize"},
  photo: {height: 210, width: "100%", resizeMode: "contain", backgroundColor: "#f3f4f1"},
  event: {borderLeftWidth: 2, borderColor: "#d8ddda", paddingLeft: 12, gap: 5},
});
