import { snapshotTitle } from '@shared/canvas/recovery-snapshot'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { TextButton } from '@/components/ui/text-button'
import { currentLocale, t } from '@/i18n/ui-strings'
import {
  selectRecoveryOffers,
  selectRecoveryPrompting,
  useRecoveryStore
} from '@/store/recovery-store'

// Later is explicit so a stray backdrop click cannot hide the recovery choice.
const requireAnAnswer = () => {}

export function RecoveryDialog() {
  const offers = useRecoveryStore(selectRecoveryOffers)
  const prompting = useRecoveryStore(selectRecoveryPrompting)
  const restore = useRecoveryStore((s) => s.restoreOffer)
  const discard = useRecoveryStore((s) => s.discardOffer)
  const defer = useRecoveryStore((s) => s.deferOffers)
  const busy = useRecoveryStore((s) => s.busy || s.scanning)
  const error = useRecoveryStore((s) => s.error)
  const scanError = useRecoveryStore((s) => s.scanError)
  const batchRemaining = useRecoveryStore((s) => s.batchRemaining)
  const offer = prompting ? offers[0] : undefined
  if (!offer) {
    return null
  }
  const quarantined = 'quarantined' in offer
  const title = quarantined ? '' : snapshotTitle(offer.snapshot)
  const savedAt = quarantined
    ? ''
    : new Date(offer.snapshot.savedAt).toLocaleString(currentLocale())

  return (
    <ModalDialog
      label={t('recovery.title')}
      onClose={requireAnAnswer}
      className="flex w-[24rem] flex-col gap-3"
    >
      <h2 className="text-sm font-semibold">
        {t('recovery.title')}
        {batchRemaining > 1 && (
          <span className="ml-2 font-normal text-muted-foreground">
            {t('recovery.remaining', { n: batchRemaining })}
          </span>
        )}
      </h2>
      <p className="text-xs text-muted-foreground">
        {quarantined
          ? `${t('recovery.quarantined')}${offer.version === null ? '' : ` (${offer.version})`}`
          : title === ''
            ? t('recovery.unnamedDocument')
            : t('recovery.namedDocument', { document: title })}{' '}
        {!quarantined && t('recovery.copyTime', { time: savedAt })}
      </p>
      {!quarantined && offer.snapshot.file && (
        <p className="text-xs text-muted-foreground">{t('recovery.sourceMayDiffer')}</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t('recovery.discardHint')}
        {offers.length > 1 && ` ${t('recovery.oneAtATime')}`}
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {t('recovery.retryError')}
        </p>
      )}
      {scanError && (
        <p role="alert" className="text-xs text-destructive">
          {t('recovery.scanError')}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <TextButton disabled={busy} onClick={defer}>
          {t('recovery.later')}
        </TextButton>
        <TextButton variant="destructive" disabled={busy} onClick={() => void discard()}>
          {t('recovery.discard')}
        </TextButton>
        <TextButton variant="primary" disabled={busy || quarantined} onClick={() => void restore()}>
          {t('recovery.restore')}
        </TextButton>
      </div>
    </ModalDialog>
  )
}
