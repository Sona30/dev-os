/** Where to reach us (for example to delete an account). Shown only once an address has been configured. */
export function SupportContact() {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim()
  if (!email) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-h5">Contact us</h2>
      <p className="max-w-prose text-body text-text-primary">
        Questions, or want your account deleted? Email{' '}
        <a href={`mailto:${email}`} className="text-brand underline">
          {email}
        </a>
        .
      </p>
    </section>
  )
}
