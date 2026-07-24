import { isExplicitLaunchConfirmation } from '@/lib/workspaceDomain'

export function canLaunchFromMessage(
  message: string,
  draftId: string | null
): boolean {
  return Boolean(
    draftId &&
      !draftId.startsWith('estimate-') &&
      isExplicitLaunchConfirmation(message)
  )
}
