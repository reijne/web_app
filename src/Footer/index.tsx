import { EmailLogo, GithubLogo, LinkedInLogo } from '../logos'

import './Footer.css'

function Footer() {
  return (
    <footer className="Footer">
      <GithubLogo />
      <LinkedInLogo />
      <EmailLogo />
    </footer>
  )
}

export default Footer
