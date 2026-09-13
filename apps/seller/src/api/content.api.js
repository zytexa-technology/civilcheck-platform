import API from './axios'

// Public Content Control reads — no auth required. Used by Terms.jsx /
// Privacy.jsx (mandatory Terms & Conditions / Privacy Policy consent).
export const getDisclaimer = async (key) => {
  const response = await API.get(`/content/disclaimers/${key}`)
  return response.data
}
