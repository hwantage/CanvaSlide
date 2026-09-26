import assert from 'node:assert/strict'

// Each job's lines, keyed by job id, from a workflow whose jobs sit at two-space indent.
export function jobsOf(workflow) {
  const jobs = {}
  let current = null
  for (const line of workflow.slice(workflow.indexOf('\njobs:\n')).split('\n').slice(2)) {
    const id = /^ {2}([\w-]+):\s*$/.exec(line)?.[1]
    if (id) {
      current = jobs[id] = []
    } else if (current && !/^ {2}#/.test(line)) {
      current.push(line)
    }
  }
  return Object.fromEntries(Object.entries(jobs).map(([id, lines]) => [id, lines.join('\n')]))
}

// Steps split at their `- ` marker, so each keeps its own `with:`, `env:` and `run:`.
export const stepsOf = (job) => job.split(/\n(?= {6}- )/).slice(1)

// Why: a job or step that is skipped or may fail without failing its job lets a failed check through.
export const bypassesFailure = /\n\s+(-\s+)?(if|continue-on-error):/

// The step whose `run:` is exactly `command`, failing unless exactly one exists and nothing lets it
// or its job be skipped or fail without failing the run.
export function checkedStep(job, command) {
  // Why: job keys may follow `steps:`, and only they sit at four spaces.
  assert.doesNotMatch(job, /\n {4}(if|continue-on-error):/)
  const steps = stepsOf(job).filter(
    (step) => step.startsWith(`      - run: ${command}\n`) || step === `      - run: ${command}`
  )
  assert.equal(steps.length, 1, command)
  assert.doesNotMatch(steps[0], bypassesFailure, command)
  return steps[0]
}
