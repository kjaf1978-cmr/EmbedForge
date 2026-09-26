import asyncio
from gpiozero import LED

led = LED(6)
async def main():
    while True:
        led.toggle()
        await asyncio.sleep(1)
asyncio.run(main())
