import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAuthErrorMessage, useAuth } from '@/hooks/useAuth'

export function RegisterPage() {
  const navigate = useNavigate()
  const { register, isRegistering, registerError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    register({ email, password, display_name: displayName.trim() || null }, { onSuccess: () => navigate('/') })
  }

  return (
    // 外层容器：深邃的红褐色打底，包裹所有流体效果
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#2D0D04] px-4 py-10">
      
      {/* === 动态流体背景层 (Fluid Mesh Gradient) === */}
      <div className="absolute -left-[10%] -top-[10%] h-[70vh] w-[70vw] rounded-full bg-[var(--accent)]/50 blur-[130px] [animation:blob-float_25s_linear_infinite_alternate]" />
      <div className="absolute -right-[10%] top-[30%] h-[80vh] w-[70vw] rounded-full bg-[#9b2c0c]/40 blur-[150px] [animation:blob-float_20s_linear_infinite_alternate_reverse]" />
      <div className="absolute -bottom-[20%] left-[20%] h-[60vh] w-[60vw] rounded-full bg-[#ff5e29]/20 blur-[140px] [animation:blob-float_30s_linear_infinite_alternate]" />

      {/* === 主卡片层 (悬浮在流体之上) === */}
      <div className="relative z-10 flex w-full max-w-[880px] flex-col overflow-hidden !rounded-[20px] bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] border border-white/15 md:min-h-[500px] md:flex-row">
        
        {/* === 左侧品牌区 === */}
        <div className="relative hidden w-[45%] flex-col justify-center bg-[var(--accent)] !p-12 text-white md:flex">
          <div className="absolute -left-[100px] -top-[150px] h-[450px] w-[450px] rounded-full bg-white/10" />
          <div className="absolute -bottom-[80px] -left-[60px] h-[250px] w-[250px] rounded-full bg-black/10" />

          <div className="relative z-10">
            <h2 className="!text-[2.75rem] !font-black !leading-none !tracking-tight text-white uppercase">
              Join AAF
            </h2>
            <p className="!mt-2 !text-[10px] !font-bold uppercase !tracking-widest text-white/80">
              Anteater Acing the Future
            </p>
            <p className="!mt-6 !max-w-[85%] !text-[11px] !leading-relaxed text-white/70">
              Create an account to save your guides and pick up right where you left off.
            </p>
          </div>
        </div>

        {/* === 右侧表单区 === */}
        <div className="relative flex w-full flex-col items-center justify-center bg-white !p-8 md:w-[55%]">
          
          <div className="absolute left-[-120px] top-[60%] h-[240px] w-[240px] -translate-y-1/2 rounded-full bg-gradient-to-br from-[var(--accent-hover)] to-[var(--accent)] shadow-xl hidden md:block" />
          <div className="absolute -bottom-[80px] -right-[80px] h-[180px] w-[180px] rounded-full bg-gradient-to-br from-[var(--accent)] to-[#401205] opacity-90 hidden md:block" />

          <form onSubmit={handleSubmit} className="relative z-10 flex w-full max-w-[280px] flex-col !gap-6">
            <div className="text-center !mb-1">
              <h1 className="!text-[26px] !font-extrabold text-[var(--ink-black)] leading-tight">Create account</h1>
              <p className="!mt-1.5 !text-[10px] text-gray-400">Join AAF to start building your study plan.</p>
            </div>

            <div className="flex flex-col !gap-3">
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-gray-400">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                </div>
                <input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  placeholder="Full Name (Optional)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full !rounded-md !border-none !bg-[#f4f6f8] !py-3 !pl-10 !pr-4 !text-[13px] text-[var(--ink-black)] !outline-none transition-all placeholder:text-gray-400 focus:!bg-white focus:!ring-2 focus:!ring-[var(--accent)]"
                />
              </div>

              <div className="relative flex items-center">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-gray-400">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" /><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" /></svg>
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full !rounded-md !border-none !bg-[#f4f6f8] !py-3 !pl-10 !pr-4 !text-[13px] text-[var(--ink-black)] !outline-none transition-all placeholder:text-gray-400 focus:!bg-white focus:!ring-2 focus:!ring-[var(--accent)]"
                />
              </div>

              <div>
                <div className="relative flex items-center">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-gray-400">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                  </div>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full !rounded-md !border-none !bg-[#f4f6f8] !py-3 !pl-10 !pr-4 !text-[13px] text-[var(--ink-black)] !outline-none transition-all placeholder:text-gray-400 focus:!bg-white focus:!ring-2 focus:!ring-[var(--accent)]"
                  />
                </div>
                <p className="!mt-1 !text-[9px] text-gray-400 !pl-1">At least 8 characters.</p>
              </div>
            </div>

            {registerError && <p className="text-center !text-xs text-red-500">{getAuthErrorMessage(registerError)}</p>}

            <button
              type="submit"
              disabled={isRegistering}
              className="!mt-1 w-full !rounded-md !border-none !bg-[var(--accent)] !py-3 !text-[13px] !font-bold tracking-wide text-white transition-all hover:!bg-[var(--accent-hover)] focus:!outline-none active:!scale-[0.98] disabled:!opacity-70"
            >
              {isRegistering ? 'Creating account...' : 'Create account'}
            </button>

            <p className="text-center !text-[11px] text-gray-400">
              Already have an account?{' '}
              <Link to="/login" className="!font-semibold text-[var(--accent)] hover:underline">
                Log in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
