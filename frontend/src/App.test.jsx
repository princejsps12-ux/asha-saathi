// @vitest-environment jsdom
// "Reset demo data" must leave a clean demo: fresh data on the server AND a fresh, empty visit screen.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { api } from './api.js'
import { loadPending, savePending } from './pendingVisit.js'

vi.mock('./api.js', () => ({
  ApiError: class ApiError extends Error {},
  toUiError: () => ({ k: 'err_server' }),
  api: {
    status: vi.fn(),
    samples: vi.fn(),
    symptoms: vi.fn(),
    beneficiaries: vi.fn(),
    due: vi.fn(),
    highRisk: vi.fn(),
    resetDemo: vi.fn(),
    saveVisit: vi.fn(),
    evaluate: vi.fn(),
    extract: vi.fn(),
  },
}))

const FIELDS = { beneficiary_id: 1, beneficiary_name: 'सुनीता साहू', beneficiary_name_en: 'Sunita Sahu', symptoms: [] }
const PENDING = {
  transcript: 'सुनीता साहू सात महीने',
  analysis: { fields: FIELDS, alerts: [], risk: 'normal', summary_hi: 'सारांश', summary_en: 'Summary', unclear: [] },
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  api.status.mockResolvedValue({ stt: 'browser', today: '2026-11-27', offline_mode: true })
  api.samples.mockResolvedValue([{ id: 's', label_hi: 'नमूना', label_en: 'Sample', text: 'x' }])
  api.symptoms.mockResolvedValue({})
  api.beneficiaries.mockResolvedValue([{ id: 1, name_hi: 'सुनीता साहू', name_en: 'Sunita Sahu', village: 'कुरुद' }])
  api.due.mockResolvedValue({ today: [], tomorrow: [], overdue: [] })
  api.highRisk.mockResolvedValue([])
  api.resetDemo.mockResolvedValue({ ok: true })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  window.scrollTo = vi.fn()
})
afterEach(cleanup)

describe('Reset demo data', () => {
  it('clears the visit on screen (and the saved copy) and returns to a fresh home screen', async () => {
    savePending(PENDING) // an unsaved visit is on screen
    render(<App />)
    expect(await screen.findByText(PENDING.transcript)).toBeTruthy()
    expect(screen.getByRole('button', { name: /हाँ ✓/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Reset demo data/ }))

    await waitFor(() => expect(api.resetDemo).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByText(PENDING.transcript)).toBeNull())
    expect(screen.queryByRole('button', { name: /हाँ ✓/ })).toBeNull()
    expect(loadPending()).toBeNull() // a refresh cannot bring it back
    expect(screen.getByRole('button', { name: /Sample/ })).toBeTruthy() // the fresh home screen
  })

  it('keeps everything if the reset fails, and says so', async () => {
    api.resetDemo.mockRejectedValue(new Error('offline'))
    savePending(PENDING)
    render(<App />)
    await screen.findByText(PENDING.transcript)
    fireEvent.click(screen.getByRole('button', { name: /Reset demo data/ }))
    await waitFor(() => expect(api.resetDemo).toHaveBeenCalled())
    expect(screen.getByText(PENDING.transcript)).toBeTruthy()
    expect(loadPending()).not.toBeNull()
  })
})
