const API_BASE = import.meta.env.VITE_API_BASE

export async function fetchPreorders() {
  const res = await fetch(`${API_BASE}/preorders`)
  return res.json()
}

export async function reclassifyProduct(productId: number) {
  const res = await fetch(`${API_BASE}/preorders/reclassify/${productId}`, {
    method: "POST"
  })
  return res.json()
}
