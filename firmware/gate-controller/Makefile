# Gate controller firmware (P9, D48).
#   make test   the host unit tests of the logic (g++)
#   make nano   the Arduino Nano build (avr-gcc and the Arduino AVR core, e.g. Ubuntu's gcc-avr,
#               avr-libc and arduino-core-avr; the PlatformIO build is in platformio.ini)
# SPDX-License-Identifier: GPL-3.0-or-later

BUILD ?= build
CXX ?= g++
ARDUINO ?= /usr/share/arduino/hardware/arduino/avr
LOGIC := src/gate_logic.cpp src/nec.cpp

.PHONY: test nano clean
test: $(BUILD)/host_tests
	$(BUILD)/host_tests

$(BUILD)/host_tests: test/test_main.cpp $(LOGIC) src/*.h
	@mkdir -p $(BUILD)
	$(CXX) -std=c++17 -O1 -Wall -Wextra -Werror -o $@ test/test_main.cpp $(LOGIC)

# the Nano (ATmega328P, 16 MHz): the Arduino core, EEPROM and our sources, linked with avr-gcc
MCU := -mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10819 -DARDUINO_AVR_NANO -DARDUINO_ARCH_AVR
CORE := $(ARDUINO)/cores/arduino
INC := -I$(CORE) -I$(ARDUINO)/variants/eightanaloginputs -I$(ARDUINO)/libraries/EEPROM/src
AVRFLAGS := $(MCU) -Os -ffunction-sections -fdata-sections -flto
CORE_C := $(wildcard $(CORE)/*.c)
CORE_CPP := $(wildcard $(CORE)/*.cpp)
CORE_S := $(wildcard $(CORE)/*.S)

nano: $(BUILD)/gate-controller.hex
$(BUILD)/gate-controller.elf: src/*.cpp src/*.h
	@mkdir -p $(BUILD)/core
	@for f in $(CORE_C); do avr-gcc $(AVRFLAGS) $(INC) -std=gnu11 -c $$f -o $(BUILD)/core/$$(basename $$f).o || exit 1; done
	@for f in $(CORE_CPP); do avr-g++ $(AVRFLAGS) $(INC) -std=gnu++11 -fno-exceptions -fno-threadsafe-statics -c $$f -o $(BUILD)/core/$$(basename $$f).o || exit 1; done
	@for f in $(CORE_S); do avr-gcc $(MCU) $(INC) -x assembler-with-cpp -c $$f -o $(BUILD)/core/$$(basename $$f).o || exit 1; done
	avr-g++ $(AVRFLAGS) $(INC) -std=gnu++11 -fno-exceptions -fno-threadsafe-statics -Wall -o $@ src/*.cpp $(BUILD)/core/*.o -Wl,--gc-sections -lm
$(BUILD)/gate-controller.hex: $(BUILD)/gate-controller.elf
	avr-objcopy -O ihex -R .eeprom $< $@
	avr-size --mcu=atmega328p -C $< || avr-size $<

clean:
	rm -rf $(BUILD)
