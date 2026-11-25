# Block moulding machine firmware (P9, D24, D48).
#   make test   the host unit tests of the logic (g++)
#   make mega   the Arduino Mega 2560 build (avr-gcc and the Arduino AVR core, e.g. Ubuntu's gcc-avr,
#               avr-libc and arduino-core-avr; the PlatformIO build is in platformio.ini)
# SPDX-License-Identifier: GPL-3.0-or-later

BUILD ?= build
CXX ?= g++
ARDUINO ?= /usr/share/arduino/hardware/arduino/avr
LOGIC := src/machine_logic.cpp

.PHONY: test mega clean
test: $(BUILD)/host_tests
	$(BUILD)/host_tests

$(BUILD)/host_tests: test/test_main.cpp $(LOGIC) src/*.h
	@mkdir -p $(BUILD)
	$(CXX) -std=c++17 -O1 -Wall -Wextra -Werror -o $@ test/test_main.cpp $(LOGIC)

# the Mega 2560 (ATmega2560, 16 MHz): the Arduino core and our sources, linked with avr-gcc
MCU := -mmcu=atmega2560 -DF_CPU=16000000L -DARDUINO=10819 -DARDUINO_AVR_MEGA2560 -DARDUINO_ARCH_AVR
CORE := $(ARDUINO)/cores/arduino
INC := -I$(CORE) -I$(ARDUINO)/variants/mega 
AVRFLAGS := $(MCU) -Os -ffunction-sections -fdata-sections -flto
CORE_C := $(wildcard $(CORE)/*.c)
CORE_CPP := $(wildcard $(CORE)/*.cpp)
CORE_S := $(wildcard $(CORE)/*.S)

mega: $(BUILD)/block-machine.hex
$(BUILD)/block-machine.elf: src/*.cpp src/*.h
	@mkdir -p $(BUILD)/core
	@for f in $(CORE_C); do avr-gcc $(AVRFLAGS) $(INC) -std=gnu11 -c $$f -o $(BUILD)/core/$$(basename $$f).o || exit 1; done
	@for f in $(CORE_CPP); do avr-g++ $(AVRFLAGS) $(INC) -std=gnu++11 -fno-exceptions -fno-threadsafe-statics -c $$f -o $(BUILD)/core/$$(basename $$f).o || exit 1; done
	@for f in $(CORE_S); do avr-gcc $(MCU) $(INC) -x assembler-with-cpp -c $$f -o $(BUILD)/core/$$(basename $$f).o || exit 1; done
	avr-g++ $(AVRFLAGS) $(INC) -std=gnu++11 -fno-exceptions -fno-threadsafe-statics -Wall -o $@ src/*.cpp $(BUILD)/core/*.o -Wl,--gc-sections -lm
$(BUILD)/block-machine.hex: $(BUILD)/block-machine.elf
	avr-objcopy -O ihex -R .eeprom $< $@
	avr-size --mcu=atmega2560 -C $< || avr-size $<

clean:
	rm -rf $(BUILD)
