import faceLogo from './faceLogo.svg'
import github from './github.svg'
import linkedIn from './linkedIn.svg'
import email from './email.svg'

import './logos.css'

export function FaceLogo() {
  return <img src={faceLogo} className="Face-logo" alt="logo" />
}

export function GithubLogo() {
  return (
    <a
      href="https://github.com/reijne"
      target="_blank"
      rel="noopener noreferrer"
      className="social-link"
    >
      <img src={github} alt="GitHub" className="social-logo" />
      <span>reijne</span>
    </a>
  )
}

export function LinkedInLogo() {
  return (
    <a
      href="https://www.linkedin.com/in/youri-reijne/"
      target="_blank"
      rel="noopener noreferrer"
      className="social-link"
    >
      <img src={linkedIn} alt="LinkedIn" className="social-logo" />
      <span>youri-reijne</span>
    </a>
  )
}

export function EmailLogo() {
  return (
    <a
      href="mailto:y.reijne@gmail.com"
      target="_blank"
      rel="noopener noreferrer"
      className="social-link"
    >
      <img src={email} alt="Email" className="social-logo" />
      <span>y.reijne@gmail.com</span>
    </a>
  )
}
