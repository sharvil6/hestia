'use client'

import { useRouter } from 'next/navigation'

export default function Login() {
  const router = useRouter()
  const familyMembers = [
    { id: '1', name: 'Mom', color: 'bg-red-100 text-red-700' },
    { id: '2', name: 'Dad', color: 'bg-blue-100 text-blue-700' },
    { id: '3', name: 'Kids', color: 'bg-green-100 text-green-700' },
  ]

  const handleLogin = (id: string) => {
    // In reality this hits a POST /auth/login setting a persistent cookie securely from backend
    document.cookie = `hestia_user=${id}; path=/; max-age=31536000`
    router.push('/')
  }

  return (
    <main className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl font-serif text-[#CC5500] mb-2">Welcome to Hestia</h1>
      <p className="text-gray-500 mb-10">Who is cooking today?</p>
      
      <div className="flex gap-6 justify-center flex-wrap">
        {familyMembers.map(member => (
          <button 
            key={member.id} 
            onClick={() => handleLogin(member.id)}
            className={`w-24 h-24 rounded-full shadow-sm hover:shadow-md transition flex items-center justify-center text-xl font-medium ${member.color}`}
          >
            {member.name}
          </button>
        ))}
      </div>
    </main>
  )
}
