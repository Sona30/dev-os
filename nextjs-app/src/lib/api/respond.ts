import { NextResponse } from 'next/server'

// Small response helpers so handlers never hand-roll status codes or headers.

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 })
}

export function accepted<T>(data: T) {
  return NextResponse.json(data, { status: 202 })
}

export function noContent() {
  return new NextResponse(null, { status: 204 })
}
