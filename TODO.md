- add resource Management based on RAII and gleam syntax:
pub fn process_file() {
  use file <- with_file("data.txt")
  use connection <- with_database()
  process_data_with_resources(file, connection)
}

- 