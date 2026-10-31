# Sonda: test agenta recenzującego Entire

Plik jednorazowy, służy tylko do sprawdzenia, czy agent Code review na Entire
uruchamia się po pushu. Zawiera celowy błąd.

```js
function sumaDo(n) {
  let suma = 0;
  for (let i = 1; i <= n; i++) {
    suma += i;
  }
  return suma;
}
```

Powyżej `sumaDo(0)` zwraca 0 (poprawnie), ale gdy `n` jest ujemne, pętla się nie wykonuje.
