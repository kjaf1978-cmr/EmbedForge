#include <Arduino.h>
// Arduino Blink + analogRead + analogWrite + Serial (unmodified Arduino API usage)
void setup() { pinMode(LED_BUILTIN, OUTPUT); Serial.begin(115200); }
void loop() {
  digitalWrite(LED_BUILTIN, HIGH); delay(500);
  digitalWrite(LED_BUILTIN, LOW);  delay(500);
  int a = analogRead(A0); analogWrite(9, a / 4);
  Serial.print("t="); Serial.print(millis()); Serial.print(" a="); Serial.println(a);
}
