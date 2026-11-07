// Enregistre les répliques du narrateur avec ElevenLabs, une fois pour toutes (client/public/voix/<nom>.mp3).
// Le jeu en ligne ne fait que lire ces MP3 : la clé ne sert qu'ici, jamais dans le jeu ni dans le dépôt.
// Elle est dans .env.local (ignoré par git), posée par `npx -y @elevenlabs/cli@latest onboard init`.
//
//   npx tsx --env-file=.env.local scripts/voix.ts quota              l'offre et les caractères restants du mois
//   npx tsx --env-file=.env.local scripts/voix.ts voix               voix françaises gratuites + leurs extraits (gratuits)
//   npx tsx --env-file=.env.local scripts/voix.ts ajouter <owner> <voice> <nom>   l'ajoute à « Mes voix »
//   npx tsx --env-file=.env.local scripts/voix.ts essai <voice>…     un extrait du jeu par voix (coûte des caractères)
//   npx tsx --env-file=.env.local scripts/voix.ts tout <voice>       toutes les répliques, dans client/public/voix/
//
// Options : --modele=eleven_v4 (par défaut), --stabilite=0.5, --ressemblance=0.8.
// Offre gratuite seulement : le script refuse de générer si l'offre n'est pas « free » ou si le quota ne suffit pas.
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { voiceLines } from '../shared/roles';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESSAIS = join(ROOT, 'essais-voix');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opt = (name: string, def: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def;
const client = new ElevenLabsClient(); // lit ELEVENLABS_API_KEY

const SAMPLE =
  'La nuit tombe sur le village. Tout le monde ferme les yeux. Loups-Garous, réveillez-vous et regardez-vous. Un Loup-Garou seul peut regarder une carte du centre. Loups-Garous, rendormez-vous. Le jour se lève. Tout le monde ouvre les yeux !';

async function save(stream: ReadableStream<Uint8Array>, file: string): Promise<void> {
  mkdirSync(dirname(file), { recursive: true });
  const chunks: Buffer[] = [];
  for await (const c of Readable.fromWeb(stream as import('node:stream/web').ReadableStream<Uint8Array>)) chunks.push(Buffer.from(c));
  writeFileSync(file, Buffer.concat(chunks));
}

/**
 * Gratuit uniquement : les crédits offerts du mois (offre « free », ou « payg » sans recharge), sans dépassement
 * possible ni facture en attente, et assez de caractères pour ce qu'on va dire.
 */
async function ensureFree(chars: number): Promise<void> {
  const s = await client.user.subscription.get();
  const left = s.characterLimit - s.characterCount;
  if (!['free', 'payg'].includes(s.tier) || s.canExtendCharacterLimit || s.hasOpenInvoices)
    throw new Error(`Offre « ${s.tier} » : ce script ne génère qu'avec les crédits gratuits du mois, sans dépassement possible.`);
  if (chars > left) throw new Error(`Il faut ${chars} caractères, il en reste ${left} ce mois-ci.`);
}

async function tts(voice: string, text: string, file: string): Promise<void> {
  const model = opt('modele', 'eleven_v4');
  const audio = await client.textToSpeech.convert(voice, {
    text: text.replace(/ /g, ' '),
    modelId: model,
    languageCode: model === 'eleven_multilingual_v2' ? undefined : 'fr',
    outputFormat: 'mp3_44100_64',
    voiceSettings: { stability: Number(opt('stabilite', '0.5')), similarityBoost: Number(opt('ressemblance', '0.8')) },
  });
  await save(audio, file);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = args;
  if (cmd === 'quota') {
    const s = await client.user.subscription.get();
    const reset = s.nextCharacterCountResetUnix ? new Date(s.nextCharacterCountResetUnix * 1000).toLocaleDateString('fr-FR') : '?';
    console.log(`Offre : ${s.tier} (${s.status}) · ${s.characterCount} / ${s.characterLimit} caractères utilisés · remise à zéro le ${reset} · dépassement possible : ${s.canExtendCharacterLimit ? 'oui' : 'non'}`);
    console.log(`Voix personnelles : ${s.voiceSlotsUsed} / ${s.voiceLimit}`);
  } else if (cmd === 'voix') {
    const res = await client.voices.getShared({ language: 'fr', pageSize: 100, sort: 'usage_character_count_1y' });
    const free = res.voices.filter((v) => v.freeUsersAllowed && !v.fiatRate && (v.rate ?? 1) <= 1 && v.previewUrl);
    console.log(`${free.length} voix françaises utilisables gratuitement (sur ${res.voices.length}) :`);
    mkdirSync(ESSAIS, { recursive: true });
    let n = 0;
    for (const v of free.slice(0, Number(opt('nombre', '40')))) {
      n++;
      console.log(`${String(n).padStart(2)}. ${v.name} · ${[v.gender, v.age, v.accent, v.useCase, v.descriptive].filter(Boolean).join(', ')} · ${v.publicOwnerId} ${v.voiceId}`);
      if (v.description) console.log(`    ${v.description.replace(/\s+/g, ' ').slice(0, 140)}`);
      if (process.argv.includes('--extraits')) {
        const r = await fetch(v.previewUrl!);
        if (r.ok) writeFileSync(join(ESSAIS, `apercu-${String(n).padStart(2, '0')}-${v.name.replace(/[^\p{L}\d]+/gu, '-').slice(0, 30)}.mp3`), Buffer.from(await r.arrayBuffer()));
      }
    }
  } else if (cmd === 'ajouter') {
    const [owner, voice, name] = rest;
    const added = await client.voices.share(owner, voice, { newName: name ?? voice });
    console.log('ajoutée :', name ?? voice, '→ voice_id', added.voiceId);
  } else if (cmd === 'essai') {
    await ensureFree(SAMPLE.length * rest.length);
    for (const voice of rest) {
      await tts(voice, SAMPLE, join(ESSAIS, `essai-${voice}.mp3`));
      console.log('essai :', voice);
    }
  } else if (cmd === 'tout') {
    const [voice] = rest;
    const lines = voiceLines();
    await ensureFree(Object.values(lines).join('').length);
    for (const [id, text] of Object.entries(lines)) {
      await tts(voice, text, join(ROOT, 'client', 'public', 'voix', `${id}.mp3`));
      process.stdout.write('.');
    }
    console.log(` ${Object.keys(lines).length} répliques`);
  } else {
    console.log('Commandes : quota, voix, ajouter, essai, tout (voir l’en-tête du script).');
  }
}

main().catch((e: unknown) => {
  const err = e as { statusCode?: number; body?: unknown; message?: string };
  console.error(err.statusCode ? `Erreur ${err.statusCode} : ${JSON.stringify(err.body).slice(0, 400)}` : (err.message ?? e));
  process.exit(1);
});
