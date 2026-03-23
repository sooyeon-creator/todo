import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/Dashboard'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: tasks } = await supabase.from('tasks').select('*').order('sort_order', { ascending: true })

  return (
    <Dashboard
      user={user}
      initialTasks={tasks ?? []}
    />
  )
}
