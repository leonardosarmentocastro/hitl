### End-to-end tests

- A user-visible bug ships with an end-to-end test that reproduces it and then proves it
  fixed, written red first.
- A feature's critical happy path gets one end-to-end test.
- That test belongs to the slice that first makes the path exercisable — never to a terminal
  "e2e slice", which is MIS-SLICED.
- A pure API fix needs none.
