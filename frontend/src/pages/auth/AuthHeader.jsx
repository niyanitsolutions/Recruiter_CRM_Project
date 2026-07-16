import { Link } from 'react-router-dom'
import { Rocket, Crown } from 'lucide-react'

// Shared top bar for Login and Forgot Password — logo left, sign-up CTAs
// right. Previously these two CTAs lived inside the login card; they now
// live here so both auth pages present the same header.
export default function AuthHeader() {
  return (
    <header className="hf-auth-header">
      <div className="hf-auth-header-logo">
        <img src="/Hire_Flow_Logo.png" alt="HireFlow" loading="eager" />
      </div>

      <div className="hf-auth-header-cta">
        <span className="hf-auth-header-text">Don't have an account?</span>
        <div className="hf-header-buttons">
          <Link to="/register?mode=trial">
            <button className="hf-header-btn">
               Start Free Trial
            </button>
          </Link>
          <Link to="/register?mode=subscription">
            <button className="hf-header-btn">
               Buy Subscription
            </button>
          </Link>
        </div>
      </div>
    </header>
  )
}
