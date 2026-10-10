/** sessionStorage is cloned by Duplicate Tab/window.open. Only a live tab may
 * reuse its stored identity; a copied tab starts independently. BroadcastChannel
 * also works on ordinary HTTP LAN origins where Web Locks are unavailable. */
export function claimTabSession() {
  let id = sessionStorage.getItem("arena-tab");
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("arena-tab", id); }
  const nonce = crypto.randomUUID();
  const channel = new BroadcastChannel("gesture-arena-tab-identity-v1");
  let established = false, occupied = false, closed = false;
  channel.onmessage = ({ data }) => {
    if (data?.id !== id || data.nonce === nonce) return;
    if (data.type === "probe" && (established || nonce < data.nonce))
      channel.postMessage({ type: "occupied", id, nonce, target: data.nonce });
    if (data.type === "occupied" && data.target === nonce) occupied = true;
  };
  const ready = new Promise<boolean>((resolve) => {
    channel.postMessage({ type: "probe", id, nonce });
    setTimeout(() => {
      if (closed) { resolve(false); return; }
      if (occupied) {
        id = crypto.randomUUID(); sessionStorage.setItem("arena-tab", id);
        sessionStorage.removeItem("arena-auth");
      }
      established = true;
      resolve(!occupied);
    }, 250);
  });
  return { ready, close: () => { closed = true; channel.close(); } };
}
