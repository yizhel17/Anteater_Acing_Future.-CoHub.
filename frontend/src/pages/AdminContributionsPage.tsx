import { useAuth } from '@/hooks/useAuth'
import { useApproveContribution, usePendingContributions, useRejectContribution } from '@/hooks/useContributions'

export function AdminContributionsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const { data, isPending, isError } = usePendingContributions(isAdmin)
  const approve = useApproveContribution()
  const reject = useRejectContribution()
  const mutating = approve.isPending || reject.isPending

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gray-50 p-8">
        <p className="text-lg font-semibold text-gray-700">403 Forbidden — Admin Access Only</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="mb-6 text-xl font-bold text-gray-900">Pending Contributions</h1>

      {isError && <p className="text-red-600">Failed to load contributions. Please try again later.</p>}
      {isPending && <p className="text-gray-500">Loading…</p>}
      {data && data.length === 0 && <p className="text-gray-500">No pending contributions.</p>}

      <div className="flex flex-col gap-4">
        {data?.map((c) => (
          <div key={c.id} className="rounded border border-gray-200 bg-white p-4">
            <p className="font-semibold text-gray-900">{c.course}</p>
            {c.danger_zone && (
              <p className="mt-2 text-sm text-gray-700">
                <strong>Danger Zone:</strong> {c.danger_zone}
              </p>
            )}
            {c.setup_tips && (
              <p className="mt-2 text-sm text-gray-700">
                <strong>Setup Tips:</strong> {c.setup_tips}
              </p>
            )}
            {c.career_value && (
              <p className="mt-2 text-sm text-gray-700">
                <strong>Career Value:</strong> {c.career_value}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => approve.mutate(c.id)}
                disabled={mutating}
                className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => reject.mutate(c.id)}
                disabled={mutating}
                className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
