import assert from 'node:assert/strict'
import { parse } from 'yaml'

export const workflowOf = (source) => parse(source)
export const jobsOf = (source) => workflowOf(source).jobs
export const stepsOf = (job) => job.steps ?? []
export const needsOf = (job) => [job.needs ?? []].flat()

export function checkedStep(job, command) {
  assert.equal(job.if, undefined)
  assert.ok(!job['continue-on-error'])
  const steps = stepsOf(job).filter((step) => step.run?.trim() === command.trim())
  assert.equal(steps.length, 1, command)
  assert.equal(steps[0].if, undefined, command)
  assert.ok(!steps[0]['continue-on-error'], command)
  return steps[0]
}

export function checkRequiredJobs(workflow, trials) {
  const { jobs } = workflow
  const required = needsOf(jobs.passed)
  assert.equal(jobs.passed.name, 'CI passed')
  assert.equal(jobs.passed.if, 'always()')
  assert.ok(!jobs.passed['continue-on-error'])
  assert.ok(required.length > 0)
  assert.equal(new Set(required).size, required.length)
  for (const [id, reason] of Object.entries(trials)) {
    assert.ok(jobs[id] && id !== 'passed', `unknown trial: ${id}`)
    assert.ok(typeof reason === 'string' && reason.trim(), `trial rationale: ${id}`)
    assert.ok(!required.includes(id), `trial is required: ${id}`)
    assert.equal(
      jobs[id]['continue-on-error'],
      true,
      `${id}: trial must not fail the overall CI run`
    )
  }
  assert.deepEqual(
    required.toSorted((a, b) => a.localeCompare(b)),
    Object.keys(jobs)
      .filter((id) => id !== 'passed' && !(id in trials))
      .toSorted((a, b) => a.localeCompare(b))
  )
  // A trial in a required job's dependency chain would still block the gate.
  for (const id of required) {
    for (const dependency of needsOf(jobs[id])) {
      assert.ok(required.includes(dependency), `${id} depends on non-required ${dependency}`)
    }
    assert.ok(!jobs[id]['continue-on-error'], `${id} hides failures`)
  }
}
