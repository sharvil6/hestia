'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecipes } from '@/lib/api'
import Link from 'next/link'
import AddRecipeModal from '@/components/AddRecipeModal'

export default function Home() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  const { data: recipes, isLoading } = useQuery({
    queryKey: ['recipes'],
    queryFn: getRecipes
  })

  // Simple layout for the hearth dashboard
  return (
    <main className="min-h-screen p-6 bg-[#FDFBF7] text-[#2D2A26]">
      <div className="max-w-md mx-auto sm:max-w-2xl lg:max-w-4xl">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-serif text-[#CC5500]">Hestia</h1>
          <Link href="/login" className="text-sm font-medium hover:underline">
            Family Login
          </Link>
        </header>

        <section className="mb-6">
          <input 
            type="search" 
            placeholder="Search family recipes..." 
            className="w-full p-4 rounded-xl border border-gray-200 shadow-sm outline-none focus:ring-2 focus:ring-[#8A9A5B]"
          />
        </section>

        {isLoading ? (
          <p>Warming the hearth...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recipes?.map((recipe: any) => (
              <Link key={recipe.id} href={`/recipe/${recipe.id}`}>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition">
                  <h2 className="text-lg font-semibold">{recipe.title}</h2>
                  {recipe.original_yield && <p className="text-sm text-gray-500 mt-1">Yields {recipe.original_yield}</p>}
                </div>
              </Link>
            ))}

             {(!recipes || recipes.length === 0) && (
              <div className="col-span-full text-center py-12 text-gray-400">
                <p>No recipes yet. Tap + to add to the hearth.</p>
              </div>
            )}
          </div>
        )}

        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="fixed bottom-6 right-6 z-30 w-14 h-14 bg-[#CC5500] text-white rounded-full shadow-lg flex items-center justify-center text-3xl hover:bg-[#aa4700] hover:scale-105 transition-all outline-none">
          +
        </button>

        <AddRecipeModal 
          isOpen={isAddModalOpen} 
          onClose={() => setIsAddModalOpen(false)} 
        />
      </div>
    </main>
  )
}
