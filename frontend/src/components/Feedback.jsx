import { Component } from 'react'
import { Bi } from '../lang.jsx'

/** A friendly, bilingual error line. `error` is { k: i18nKey, vars? } (see api.toUiError). */
export function ErrorNote({ error }) {
  if (!error) return null
  return (
    <p className="error" role="alert">
      <Bi k={error.k} vars={error.vars} always />
    </p>
  )
}

/**
 * Last line of defence: if any screen throws while rendering, show a calm bilingual message
 * and a reload button instead of a blank page. Data lives on the server, so nothing is lost.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false }
  }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error, info) {
    console.error('ASHA Saathi UI error', error, info?.componentStack)
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <div className="crash" role="alert">
        <p className="crash-icon" aria-hidden>
          🩺
        </p>
        <h2>
          <Bi k="crashTitle" always />
        </h2>
        <p>
          <Bi k="crashBody" always />
        </p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          <Bi k="reload" always />
        </button>
      </div>
    )
  }
}
