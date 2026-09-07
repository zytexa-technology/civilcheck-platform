import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // API call nahi karenge — sirf localStorage check karenge
    // Token aur user data login ke waqt save hota hai
    const token = localStorage.getItem('admin_token')
    const savedUser = localStorage.getItem('admin_user')

    if (token && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser)
        setAdmin(parsedUser)
      } catch {
        localStorage.removeItem('admin_token')
        localStorage.removeItem('admin_user')
      }
    }

    setLoading(false)
  }, [])

  const login = (token, adminData) => {
    localStorage.setItem('admin_token', token)
    localStorage.setItem('admin_user', JSON.stringify(adminData))
    setAdmin(adminData)
  }

  const logoutAdmin = () => {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    setAdmin(null)
  }

  return (
    <AuthContext.Provider value={{ admin, loading, login, logoutAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)