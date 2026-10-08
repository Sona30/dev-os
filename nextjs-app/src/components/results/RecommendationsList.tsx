interface RecommendationsListProps {
  recommendations: string[]
  activities: string[]
}

/** Practical next steps, and short at-home activities that need no worksheet or screen. */
export function RecommendationsList({ recommendations, activities }: RecommendationsListProps) {
  if (recommendations.length === 0 && activities.length === 0) return null
  return (
    <section aria-labelledby="recommendations-heading" className="flex flex-col gap-4">
      <h2 id="recommendations-heading" className="text-h5">
        Recommendations
      </h2>
      {recommendations.length > 0 ? (
        <ul className="m-0 flex max-w-prose list-disc flex-col gap-1 pl-5 text-body text-text-primary">
          {recommendations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {activities.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-body text-text-primary">Try at home (5 to 10 minutes)</h3>
          <ul className="m-0 flex max-w-prose list-disc flex-col gap-1 pl-5 text-body text-text-secondary">
            {activities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
