import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

interface UseEditorQaModeResult {
  qaForceDesktop: boolean
}

/**
 * Editor-specific QA flags.
 * Keep URL param checks centralized so UI branches remain easy to reason about.
 */
export function useEditorQaMode(): UseEditorQaModeResult {
  const [searchParams] = useSearchParams()
  return useMemo(() => {
    const qaForceDesktop = searchParams.get('qa') === '1'
    return { qaForceDesktop }
  }, [searchParams])
}
