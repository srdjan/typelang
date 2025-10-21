- [√] Add resource Management RAII ispired by and gleam syntax:

```gleam
pub fn process_file() { 
  use file <- with_file("data.txt") 
  use connection <- with_database() process_data_with_resources(file, connection) 
}
```

to something like this:

```typescript
const process_file = () => { 
  use file & connection {
    const data = file.read("data.txt") 
    const records = connection.query("SELECT * FROM users") 
    return records
  }
}
```
