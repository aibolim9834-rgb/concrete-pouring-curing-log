export const cloudStorageEnabled = () => process.env.NEXT_PUBLIC_CON1_QA !== 'true' && process.env.NEXT_PUBLIC_CON1_LOCAL_ONLY !== 'true';

export function canonical(value: unknown): string {
 if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
 if (value && typeof value==='object') return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
export async function blobHash(blob: Blob) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
}
